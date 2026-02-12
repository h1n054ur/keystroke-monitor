import { describe, it, expect } from "bun:test";
import type { SessionMeta } from "../src/types";
import { buildR2Key } from "../src/lib/storage";

describe("storage utilities", () => {
  describe("buildR2Key", () => {
    it("should build correct R2 key with zero-padded chunk index", () => {
      expect(buildR2Key("abc-123", 0)).toBe("sessions/abc-123/000000");
    });

    it("should zero-pad chunk index to 6 digits", () => {
      expect(buildR2Key("abc-123", 42)).toBe("sessions/abc-123/000042");
    });

    it("should handle large chunk indices", () => {
      expect(buildR2Key("abc-123", 999999)).toBe("sessions/abc-123/999999");
    });

    it("should handle UUID session IDs", () => {
      expect(buildR2Key("550e8400-e29b-41d4-a716-446655440000", 5))
        .toBe("sessions/550e8400-e29b-41d4-a716-446655440000/000005");
    });
  });

  describe("SessionMeta type", () => {
    it("should conform to expected shape", () => {
      const meta: SessionMeta = {
        id: "test-id",
        clientId: "test-machine",
        createdAt: "2026-02-12T10:00:00.000Z",
        updatedAt: "2026-02-12T10:30:00.000Z",
        chunkCount: 5,
        totalBytes: 2048,
      };
      expect(meta.id).toBe("test-id");
      expect(meta.chunkCount).toBe(5);
      expect(meta.totalBytes).toBe(2048);
    });
  });

  describe("SessionMeta sorting", () => {
    it("should sort by updatedAt descending", () => {
      const sessions: SessionMeta[] = [
        { id: "old", clientId: "a", createdAt: "2026-02-10T10:00:00Z", updatedAt: "2026-02-10T10:00:00Z", chunkCount: 1, totalBytes: 100 },
        { id: "new", clientId: "b", createdAt: "2026-02-12T10:00:00Z", updatedAt: "2026-02-12T10:00:00Z", chunkCount: 3, totalBytes: 500 },
        { id: "mid", clientId: "c", createdAt: "2026-02-11T10:00:00Z", updatedAt: "2026-02-11T10:00:00Z", chunkCount: 2, totalBytes: 200 },
      ];

      const sorted = sessions.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      expect(sorted[0].id).toBe("new");
      expect(sorted[1].id).toBe("mid");
      expect(sorted[2].id).toBe("old");
    });
  });
});
