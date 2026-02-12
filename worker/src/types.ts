import type { DurableObjectNamespace, R2Bucket, KVNamespace, Queue } from "@cloudflare/workers-types";

/** Cloudflare Worker environment bindings */
export interface Env {
  LOGS_BUCKET: R2Bucket;
  SESSIONS_KV: KVNamespace;
  STREAM_HUB: DurableObjectNamespace;
  UPLOAD_QUEUE: Queue<UploadPayload>;
}

/** Session metadata stored in KV */
export interface SessionMeta {
  id: string;
  clientId: string;
  createdAt: string;
  updatedAt: string;
  chunkCount: number;
  totalBytes: number;
}

/** Upload payload from the Python client (also the Queue message shape) */
export interface UploadPayload {
  clientId: string;
  sessionId: string;
  data: string;
  timestamp: string;
}

/** GET /api/logs response */
export interface LogListResponse {
  sessions: SessionMeta[];
  cursor: string | null;
}

/** GET /api/logs/:id/:chunk response */
export interface LogChunkResponse {
  sessionId: string;
  chunkIndex: number;
  data: string;
  timestamp: string;
}

/** WebSocket message types */
export type WSMessageType = "subscribe" | "keystroke" | "error" | "connected";

export interface WSMessage {
  type: WSMessageType;
}

export interface WSSubscribeMessage extends WSMessage {
  type: "subscribe";
  sessionId: string | "*";
}

export interface WSKeystrokeMessage extends WSMessage {
  type: "keystroke";
  sessionId: string;
  clientId: string;
  data: string;
  timestamp: string;
}

export interface WSErrorMessage extends WSMessage {
  type: "error";
  message: string;
}

export interface WSConnectedMessage extends WSMessage {
  type: "connected";
  message: string;
}

/** Standard API error */
export interface ApiError {
  error: string;
  status: number;
}

/** Standard API success */
export interface ApiSuccess<T> {
  data: T;
  status: number;
}
