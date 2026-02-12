import { Hono } from "hono";
import type { Env, LogListResponse, LogChunkResponse } from "../types";
import {
  listSessions,
  getSession,
  getLogChunk,
  listSessionChunks,
  deleteSession,
} from "../lib/storage";

const logs = new Hono<{ Bindings: Env }>();

/** GET /api/logs – list all sessions */
logs.get("/", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const cursor = c.req.query("cursor") ?? undefined;
  const result = await listSessions(c.env.SESSIONS_KV, limit, cursor);
  const response: LogListResponse = { sessions: result.sessions, cursor: result.cursor };
  return c.json({ data: response, status: 200 });
});

/** GET /api/logs/:sessionId – session detail */
logs.get("/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = await getSession(c.env.SESSIONS_KV, sessionId);
  if (!session) return c.json({ error: "Session not found", status: 404 }, 404);
  const chunkKeys = await listSessionChunks(c.env.LOGS_BUCKET, sessionId);
  return c.json({
    data: { session, chunks: chunkKeys.map((key, index) => ({ index, key })) },
    status: 200,
  });
});

/** GET /api/logs/:sessionId/:chunkIndex – single chunk */
logs.get("/:sessionId/:chunkIndex", async (c) => {
  const sessionId = c.req.param("sessionId");
  const chunkIndex = parseInt(c.req.param("chunkIndex"), 10);
  if (isNaN(chunkIndex) || chunkIndex < 0)
    return c.json({ error: "Invalid chunk index", status: 400 }, 400);
  const chunk = await getLogChunk(c.env.LOGS_BUCKET, sessionId, chunkIndex);
  if (!chunk) return c.json({ error: "Chunk not found", status: 404 }, 404);
  const response: LogChunkResponse = {
    sessionId,
    chunkIndex,
    data: chunk.data,
    timestamp: chunk.metadata.timestamp ?? "",
  };
  return c.json({ data: response, status: 200 });
});

/** DELETE /api/logs/:sessionId – delete session + chunks */
logs.delete("/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = await getSession(c.env.SESSIONS_KV, sessionId);
  if (!session) return c.json({ error: "Session not found", status: 404 }, 404);
  await deleteSession(c.env.SESSIONS_KV, c.env.LOGS_BUCKET, sessionId);
  return c.json({ data: { deleted: sessionId }, status: 200 });
});

export { logs };
