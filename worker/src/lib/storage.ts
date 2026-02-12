import type { R2Bucket, KVNamespace } from "@cloudflare/workers-types";
import type { SessionMeta } from "../types";

// ─── R2 ───────────────────────────────────────────────────────────────────────

export function buildR2Key(sessionId: string, chunkIndex: number): string {
  return `sessions/${sessionId}/${chunkIndex.toString().padStart(6, "0")}`;
}

export async function storeLogChunk(
  bucket: R2Bucket,
  sessionId: string,
  chunkIndex: number,
  data: string,
  metadata: Record<string, string>,
): Promise<void> {
  await bucket.put(buildR2Key(sessionId, chunkIndex), data, { customMetadata: metadata });
}

export async function getLogChunk(
  bucket: R2Bucket,
  sessionId: string,
  chunkIndex: number,
): Promise<{ data: string; metadata: Record<string, string> } | null> {
  const obj = await bucket.get(buildR2Key(sessionId, chunkIndex));
  if (!obj) return null;
  return { data: await obj.text(), metadata: (obj.customMetadata as Record<string, string>) ?? {} };
}

export async function listSessionChunks(bucket: R2Bucket, sessionId: string): Promise<string[]> {
  const listed = await bucket.list({ prefix: `sessions/${sessionId}/` });
  return listed.objects.map((o) => o.key);
}

// ─── KV ───────────────────────────────────────────────────────────────────────

const PFX = "session:";
const IDX = "session_index";

export async function upsertSession(
  kv: KVNamespace,
  sessionId: string,
  clientId: string,
  bytesAdded: number,
): Promise<SessionMeta> {
  const key = PFX + sessionId;
  const existing = await kv.get<SessionMeta>(key, "json");
  const now = new Date().toISOString();

  if (existing) {
    const updated: SessionMeta = {
      ...existing,
      updatedAt: now,
      chunkCount: existing.chunkCount + 1,
      totalBytes: existing.totalBytes + bytesAdded,
    };
    await kv.put(key, JSON.stringify(updated));
    return updated;
  }

  const meta: SessionMeta = {
    id: sessionId,
    clientId,
    createdAt: now,
    updatedAt: now,
    chunkCount: 1,
    totalBytes: bytesAdded,
  };
  await kv.put(key, JSON.stringify(meta));
  await addToIndex(kv, sessionId);
  return meta;
}

export async function getSession(kv: KVNamespace, sessionId: string): Promise<SessionMeta | null> {
  return kv.get<SessionMeta>(PFX + sessionId, "json");
}

export async function listSessions(
  kv: KVNamespace,
  limit = 50,
  cursor?: string,
): Promise<{ sessions: SessionMeta[]; cursor: string | null }> {
  const ids = (await kv.get<string[]>(IDX, "json")) ?? [];
  const start = cursor ? parseInt(cursor, 10) : 0;
  const end = start + limit;
  const page = ids.slice(start, end);

  const results = await Promise.all(page.map((id) => getSession(kv, id)));
  const sessions = results.filter((m): m is SessionMeta => m !== null);
  sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return { sessions, cursor: end < ids.length ? end.toString() : null };
}

async function addToIndex(kv: KVNamespace, sessionId: string): Promise<void> {
  const ids = (await kv.get<string[]>(IDX, "json")) ?? [];
  if (!ids.includes(sessionId)) {
    ids.push(sessionId);
    await kv.put(IDX, JSON.stringify(ids));
  }
}

export async function deleteSession(kv: KVNamespace, bucket: R2Bucket, sessionId: string): Promise<void> {
  const chunks = await listSessionChunks(bucket, sessionId);
  for (const k of chunks) await bucket.delete(k);
  await kv.delete(PFX + sessionId);
  const ids = (await kv.get<string[]>(IDX, "json")) ?? [];
  await kv.put(IDX, JSON.stringify(ids.filter((id) => id !== sessionId)));
}
