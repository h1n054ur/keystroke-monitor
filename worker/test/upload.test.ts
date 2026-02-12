import { describe, it, expect } from "bun:test";
import type { UploadPayload } from "../src/types";

/** Mirrors the validation in upload.ts */
function validateUploadPayload(
  payload: Partial<UploadPayload>,
): { valid: true } | { valid: false; error: string } {
  const { clientId, sessionId, data, timestamp } = payload;

  if (!clientId || typeof clientId !== "string")
    return { valid: false, error: "Missing clientId" };
  if (!sessionId || typeof sessionId !== "string")
    return { valid: false, error: "Missing sessionId" };
  if (!data || typeof data !== "string")
    return { valid: false, error: "Missing data" };
  if (!timestamp || typeof timestamp !== "string")
    return { valid: false, error: "Missing timestamp" };

  const dataBytes = new TextEncoder().encode(data).length;
  if (dataBytes > 10 * 1024 * 1024)
    return { valid: false, error: "Payload too large" };

  return { valid: true };
}

describe("upload payload validation", () => {
  const valid: UploadPayload = {
    clientId: "test-machine",
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
    data: "hello world keystrokes",
    timestamp: "2026-02-12T10:30:00.000Z",
  };

  it("accepts a valid payload", () => {
    expect(validateUploadPayload(valid).valid).toBe(true);
  });

  it("rejects missing clientId", () => {
    const r = validateUploadPayload({ ...valid, clientId: undefined });
    expect(r.valid).toBe(false);
  });

  it("rejects missing sessionId", () => {
    const r = validateUploadPayload({ ...valid, sessionId: undefined });
    expect(r.valid).toBe(false);
  });

  it("rejects missing data", () => {
    const r = validateUploadPayload({ ...valid, data: undefined });
    expect(r.valid).toBe(false);
  });

  it("rejects missing timestamp", () => {
    const r = validateUploadPayload({ ...valid, timestamp: undefined });
    expect(r.valid).toBe(false);
  });

  it("rejects empty strings", () => {
    const r = validateUploadPayload({ ...valid, clientId: "" });
    expect(r.valid).toBe(false);
  });
});
