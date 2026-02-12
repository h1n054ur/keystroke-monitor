import { Hono } from "hono";
import type { Env } from "../types";
import { Layout } from "./layout";
import { getSession } from "../lib/storage";

const viewer = new Hono<{ Bindings: Env }>();

viewer.get("/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = await getSession(c.env.SESSIONS_KV, sessionId);

  if (!session) {
    return c.html(
      <Layout title="Not Found" activeTab="sessions">
        <div class="text-center py-24 animate-fade-up">
          <h1 class="text-xl font-bold text-white">Session not found</h1>
          <p class="text-zinc-500 text-sm mt-2">
            <code class="font-mono text-zinc-400">{sessionId}</code> does not exist.
          </p>
          <a href="/dashboard" class="text-accent text-sm mt-4 inline-block hover:underline">Back to sessions</a>
        </div>
      </Layout>,
      404,
    );
  }

  const viewerScript = `
    const sessionId = '${sessionId}';
    const totalChunks = ${session.chunkCount};
    const el = document.getElementById('log-output');
    const searchInput = document.getElementById('search-input');
    const countEl = document.getElementById('match-count');
    const chunkCountEl = document.getElementById('chunk-loaded');
    const loaderEl = document.getElementById('scroll-loader');

    const PAGE_SIZE = 20;
    let loadedUpTo = 0;
    let loading = false;
    let allLoaded = false;
    let fullText = '';
    let isSearchMode = false;

    async function loadPage() {
      if (loading || allLoaded) return;
      loading = true;
      loaderEl.style.display = 'flex';

      const start = loadedUpTo;
      const end = Math.min(start + PAGE_SIZE, totalChunks);
      if (start >= totalChunks) { allLoaded = true; loading = false; loaderEl.style.display = 'none'; return; }

      const indices = [];
      for (let i = start; i < end; i++) indices.push(i);

      const results = await Promise.all(
        indices.map(i =>
          fetch('/api/logs/' + sessionId + '/' + i)
            .then(r => r.json())
            .then(j => ({ i, data: j.data?.data || '' }))
            .catch(() => ({ i, data: '' }))
        )
      );

      results.sort((a, b) => a.i - b.i);
      let newText = '';
      for (const r of results) {
        newText += r.data;
        fullText += r.data;
      }

      loadedUpTo = end;
      allLoaded = end >= totalChunks;
      chunkCountEl.textContent = loadedUpTo + ' / ' + totalChunks + (allLoaded ? ' (all loaded)' : '');

      // Append instead of replace (preserves scroll position)
      if (!isSearchMode) {
        if (start === 0) {
          el.textContent = newText;
        } else {
          el.appendChild(document.createTextNode(newText));
        }
      }

      loading = false;
      loaderEl.style.display = allLoaded ? 'none' : 'flex';
    }

    function renderSearch(q) {
      if (!q) {
        isSearchMode = false;
        el.textContent = fullText;
        countEl.textContent = '';
        return;
      }
      isSearchMode = true;
      const re = new RegExp('(' + q.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + ')', 'gi');
      const matches = fullText.match(re);
      countEl.textContent = matches ? matches.length + ' match' + (matches.length !== 1 ? 'es' : '') : 'No matches';
      countEl.className = matches ? 'text-[12px] text-lime font-mono' : 'text-[12px] text-red-400 font-mono';
      el.innerHTML = fullText.replace(re, '<mark class="bg-accent/30 text-white rounded px-0.5">$1</mark>');
    }

    // Infinite scroll
    el.addEventListener('scroll', () => {
      if (allLoaded || loading) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadPage();
    });

    let debounce;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = e.target.value.trim();
        if (q) {
          if (!allLoaded) {
            loadAll().then(() => renderSearch(q));
          } else {
            renderSearch(q);
          }
        } else {
          renderSearch('');
        }
      }, 200);
    });

    async function loadAll() {
      while (!allLoaded) await loadPage();
    }

    // Initial load
    loadPage();
  `;

  return c.html(
    <Layout title={`Session ${sessionId.slice(0, 8)}`} activeTab="sessions" script={viewerScript}>
      <div class="animate-fade-up">
        <a href="/dashboard" class="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-300 transition-colors mb-6">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Sessions
        </a>

        <div class="flex items-start justify-between mb-6">
          <div>
            <h1 class="text-xl font-bold text-white tracking-tight">
              <span class="text-accent font-mono">{sessionId.slice(0, 8)}</span>
            </h1>
            <div class="flex items-center gap-3 mt-1.5 text-[12px] text-zinc-500">
              <span class="text-zinc-300">{session.clientId}</span>
              <span class="text-zinc-700">|</span>
              <span>{session.chunkCount} chunks</span>
              <span class="text-zinc-700">|</span>
              <span>{fmtBytes(session.totalBytes)}</span>
            </div>
          </div>
          <span id="chunk-loaded" class="text-[11px] font-mono text-zinc-600" />
        </div>

        {/* Search */}
        <div class="flex items-center gap-3 mb-4">
          <div class="relative flex-1 max-w-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="search-input"
              type="text"
              placeholder="Search logs..."
              class="w-full pl-9 pr-3 py-2 text-[13px] font-mono rounded-lg bg-bg-card border border-bg-border text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-accent/40 transition-colors"
            />
          </div>
          <span id="match-count" class="text-[12px] text-zinc-600 font-mono" />
        </div>

        {/* Output */}
        <div class="gradient-border rounded-xl bg-bg-card border border-bg-border overflow-hidden">
          <div class="px-4 py-2.5 border-b border-bg-border flex items-center justify-between">
            <span class="text-[12px] font-medium text-zinc-400">Log Output</span>
          </div>
          <pre
            id="log-output"
            class="p-4 text-[13px] font-mono text-zinc-400 whitespace-pre-wrap break-all overflow-auto leading-relaxed"
            style="max-height: 75vh;"
          >
            Loading...
          </pre>
          {/* Scroll loader */}
          <div
            id="scroll-loader"
            class="flex items-center justify-center gap-2 py-3 border-t border-bg-border text-[12px] text-zinc-600"
            style="display: none;"
          >
            <svg class="animate-spin h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Loading more...</span>
          </div>
        </div>
      </div>
    </Layout>,
  );
});

function fmtBytes(b: number): string {
  if (b === 0) return "0 B";
  const k = 1024;
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${u[i]}`;
}

export { viewer };
