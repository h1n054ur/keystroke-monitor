import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env, UploadPayload } from "./types";
import { upload } from "./api/upload";
import { logs } from "./api/logs";
import { dashboard } from "./dashboard/index";
import { viewer } from "./dashboard/viewer";
import { live } from "./dashboard/live";
import { storeLogChunk, upsertSession, getSession } from "./lib/storage";

export { StreamHub } from "./durable/stream-hub";

const app = new Hono<{ Bindings: Env }>();

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/", (c) =>
  c.json({ name: "keystroke-monitor", version: "2.1.0", status: "ok" }),
);
app.get("/health", (c) => c.json({ status: "ok" }));

// ─── API ──────────────────────────────────────────────────────────────────────

app.route("/api/upload", upload);
app.route("/api/logs", logs);

// ─── Dashboard ────────────────────────────────────────────────────────────────

app.route("/dashboard", dashboard);
app.route("/dashboard/view", viewer);
app.route("/dashboard/live", live);

// ─── WebSocket ────────────────────────────────────────────────────────────────

app.get("/ws", (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ error: "Expected WebSocket upgrade", status: 426 }, 426);
  }
  const doId = c.env.STREAM_HUB.idFromName("global");
  const stub = c.env.STREAM_HUB.get(doId);
  const url = new URL("/ws", c.req.url);
  return stub.fetch(url.toString(), c.req.raw) as unknown as Promise<Response>;
});

// ─── Fallback ─────────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: "Not found", status: 404 }, 404));
app.onError((err, c) => {
  console.error("Unhandled:", err);
  return c.json({ error: "Internal server error", status: 500 }, 500);
});

// ─── Queue Consumer ───────────────────────────────────────────────────────────

/**
 * Process batched upload messages from the Queue.
 * Does the heavy R2/KV writes async so the upload endpoint stays fast.
 */
async function handleQueue(
  batch: MessageBatch<UploadPayload>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    const { clientId, sessionId, data, timestamp } = msg.body;
    try {
      const bytes = new TextEncoder().encode(data).length;
      const existing = await getSession(env.SESSIONS_KV, sessionId);
      const chunkIndex = existing ? existing.chunkCount : 0;

      await storeLogChunk(env.LOGS_BUCKET, sessionId, chunkIndex, data, {
        clientId,
        timestamp,
      });

      await upsertSession(env.SESSIONS_KV, sessionId, clientId, bytes);
      msg.ack();
    } catch (err) {
      console.error("Queue process error:", err);
      msg.retry();
    }
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
  fetch: app.fetch,
  queue: handleQueue,
};
