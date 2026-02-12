import { Hono } from "hono";
import type { Env, UploadPayload } from "../types";

const upload = new Hono<{ Bindings: Env }>();

/**
 * POST /api/upload
 * Validates, enqueues to CF Queue (async R2/KV write), and broadcasts
 * to the DO live feed immediately. Returns 200 near-instantly.
 */
upload.post("/", async (c) => {
  let body: UploadPayload;
  try {
    body = await c.req.json<UploadPayload>();
  } catch {
    return c.json({ error: "Invalid JSON", status: 400 }, 400);
  }

  const { clientId, sessionId, data, timestamp } = body;

  if (!clientId || typeof clientId !== "string")
    return c.json({ error: "Missing clientId", status: 400 }, 400);
  if (!sessionId || typeof sessionId !== "string")
    return c.json({ error: "Missing sessionId", status: 400 }, 400);
  if (!data || typeof data !== "string")
    return c.json({ error: "Missing data", status: 400 }, 400);
  if (!timestamp || typeof timestamp !== "string")
    return c.json({ error: "Missing timestamp", status: 400 }, 400);

  const bytes = new TextEncoder().encode(data).length;
  if (bytes > 10 * 1024 * 1024)
    return c.json({ error: "Payload too large (10 MB max)", status: 413 }, 413);

  // Enqueue for async R2/KV storage (returns instantly)
  await c.env.UPLOAD_QUEUE.send(body);

  // Broadcast to live feed DO immediately (fast, same datacenter)
  try {
    const doId = c.env.STREAM_HUB.idFromName("global");
    const stub = c.env.STREAM_HUB.get(doId);
    await stub.fetch(new Request("https://do/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "keystroke" as const,
        sessionId,
        clientId,
        data,
        timestamp,
      }),
    }));
  } catch (err) {
    console.error("Broadcast failed:", err);
  }

  return c.json({ status: 200, queued: true });
});

export { upload };
