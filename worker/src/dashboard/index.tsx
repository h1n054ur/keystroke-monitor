import { Hono } from "hono";
import type { Env, SessionMeta } from "../types";
import { Layout } from "./layout";
import { listSessions } from "../lib/storage";

const dashboard = new Hono<{ Bindings: Env }>();

dashboard.get("/", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const cursor = c.req.query("cursor") ?? undefined;
  const result = await listSessions(c.env.SESSIONS_KV, limit, cursor);

  return c.html(
    <Layout title="Sessions" activeTab="sessions">
      <div class="animate-fade-up">
        {/* Header */}
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-2xl font-bold text-white tracking-tight">Sessions</h1>
            <p class="text-sm text-zinc-500 mt-1">
              {result.sessions.length} recorded session{result.sessions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <a
            href="/dashboard/live"
            class="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 transition-all"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-lime animate-pulse-dot" />
            Live Feed
          </a>
        </div>

        {result.sessions.length === 0 ? (
          <Empty />
        ) : (
          <div class="stagger space-y-2">
            {result.sessions.map((s) => (
              <SessionCard session={s} />
            ))}
          </div>
        )}

        {result.cursor && (
          <div class="mt-8 text-center">
            <a
              href={`/dashboard?cursor=${result.cursor}&limit=${limit}`}
              class="text-[13px] text-accent hover:text-accent/80 transition-colors"
            >
              Load more
            </a>
          </div>
        )}
      </div>
    </Layout>,
  );
});

const Empty = () => (
  <div class="flex flex-col items-center justify-center py-24 gradient-border rounded-2xl bg-bg-card border border-bg-border">
    <div class="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-5">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-zinc-600">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <line x1="6" y1="12" x2="6" y2="12.01" />
        <line x1="10" y1="12" x2="10" y2="12.01" />
        <line x1="14" y1="12" x2="14" y2="12.01" />
        <line x1="8" y1="16" x2="16" y2="16" />
      </svg>
    </div>
    <h3 class="text-lg font-medium text-zinc-300">No sessions yet</h3>
    <p class="text-[13px] text-zinc-600 mt-1.5 max-w-sm text-center">
      Start the Python client to begin capturing. Logs appear here after the first upload.
    </p>
  </div>
);

const SessionCard = ({ session }: { session: SessionMeta }) => {
  const updated = new Date(session.updatedAt);
  const created = new Date(session.createdAt);
  return (
    <a
      href={`/dashboard/view/${session.id}`}
      class="group block gradient-border rounded-xl bg-bg-card border border-bg-border hover:border-accent/30 hover:bg-bg-hover transition-all p-4"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3.5">
          {/* Icon */}
          <div class="w-9 h-9 rounded-lg bg-accent/10 border border-accent/10 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <line x1="8" y1="9" x2="16" y2="9" />
              <line x1="8" y1="13" x2="13" y2="13" />
            </svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-medium text-white text-[14px]">{session.clientId}</span>
              <span class="text-[11px] font-mono text-zinc-600">{session.id.slice(0, 8)}</span>
            </div>
            <div class="flex items-center gap-3 mt-0.5 text-[12px] text-zinc-500">
              <span>{session.chunkCount} chunk{session.chunkCount !== 1 ? "s" : ""}</span>
              <span class="text-zinc-700">|</span>
              <span>{fmtBytes(session.totalBytes)}</span>
              <span class="text-zinc-700">|</span>
              <span title={created.toISOString()}>started {fmtAgo(created)}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-[12px] text-zinc-500" title={updated.toISOString()}>
            {fmtAgo(updated)}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-zinc-600 group-hover:text-accent transition-colors">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
    </a>
  );
};

function fmtAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtBytes(b: number): string {
  if (b === 0) return "0 B";
  const k = 1024;
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${u[i]}`;
}

export { dashboard };
