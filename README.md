# keystroke-monitor

An educational, cross-platform keystroke monitoring system built with Python and Cloudflare's serverless stack. Designed to explore how operating systems handle input events, how real-time data pipelines work at the edge, and how modern cloud primitives fit together.

The client captures keystrokes on any OS and streams them to a Cloudflare Worker that persists, indexes, and broadcasts them in real-time to a live dashboard — all with near-zero latency using Cloudflare Queues.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/h1n054ur/keystroke-monitor/tree/main/worker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **For authorized testing and educational use only.** Do not use to monitor anyone without explicit consent. See [Disclaimer](#disclaimer).

---

## Why This Exists

This project was built to learn and demonstrate:

- **OS-level input handling** — how keyboard hooks work across Windows (win32), Linux (X11/evdev), and macOS (Quartz) via [pynput](https://github.com/moses-palmer/pynput)
- **Cloudflare's full platform** — Workers, R2, KV, Durable Objects, and Queues working together in a single application
- **Real-time streaming** — Durable Objects with the Hibernatable WebSocket API for scalable, persistent connections
- **Async message processing** — Cloudflare Queues decoupling ingestion from storage for instant API responses
- **Server-side rendering at the edge** — Hono JSX rendering full HTML pages inside a Worker
- **Smart client design** — event-driven flushing on meaningful boundaries (enter, tab, window switch, idle timeout) instead of arbitrary timers

## How It Works

```
┌───────────────────────┐                        ┌────────────────────────────────┐
│    Python Client      │     HTTPS POST         │    Cloudflare Worker           │
│                       │ ───────────────────>   │                                │
│  pynput keyboard hook │  (returns instantly)   │  /api/upload                   │
│  smart flush logic    │                        │    ├─ enqueue → CF Queue       │
│  background uploader  │                        │    └─ broadcast → DO (live)    │
│  local fallback       │                        │                                │
└───────────────────────┘                        │  Queue Consumer (async)        │
                                                 │    ├─ store chunk → R2         │
      ┌────────────┐       WebSocket             │    └─ update session → KV      │
      │  Dashboard │ <───────────────────────>   │                                │
      │  (browser) │                             │  Durable Object                │
      └────────────┘                             │    └─ WebSocket hub            │
                                                 │                                │
                                                 │  R2 ── log chunk storage       │
                                                 │  KV ── session metadata index  │
                                                 └────────────────────────────────┘
```

**The flow:**

1. Client hooks keyboard events via pynput (works on Windows, Linux, macOS)
2. Keystrokes buffer locally and flush on smart boundaries — enter, tab, window switch, idle timeout, or buffer cap
3. Background thread POSTs to the Worker, which enqueues the payload to a CF Queue and returns 200 instantly
4. The Worker also broadcasts to a Durable Object, which relays to all connected WebSocket dashboard clients in real-time
5. The Queue consumer processes messages async — writes the log chunk to R2 and updates session metadata in KV
6. Dashboard renders server-side via Hono JSX with Tailwind — session list, log viewer with search, live feed

## Features

**Client (Python)**
- Cross-platform keystroke capture via pynput (Windows, Linux, macOS)
- Active window tracking — logs which app is focused
- Smart flush — ships on enter, tab, window switch, 3s idle, or 200-char cap (never mid-word)
- Background upload thread — keypress handler never blocks
- Local disk fallback when server is unreachable, auto-retries later
- Clean shutdown on Ctrl+C (signal handler)
- Just 2 dependencies: `pynput` and `requests`

**Worker (Cloudflare)**
- Hono framework with full TypeScript
- Cloudflare Queues for async processing — upload endpoint returns instantly
- R2 for persistent log chunk storage
- KV for fast session metadata lookups
- Durable Objects with Hibernatable WebSocket API for real-time streaming
- Queue consumer batches up to 50 messages with 1s max wait

**Dashboard (SSR)**
- Server-side rendered with Hono JSX — no client framework, no build step
- Dark glassmorphism theme with gradient borders, glow animations
- Session list with staggered fade-in cards
- Log viewer with real-time search highlighting
- Live feed — WebSocket auto-connect, inline keystroke rendering, window context headers, message/byte counters

## Quick Start

### 1. Deploy the Worker

One click deploys everything — Worker, R2 bucket, KV namespace, Durable Object, Queue:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/h1n054ur/keystroke-monitor/tree/main/worker)

**Or manually:**

```bash
cd worker
bun install
bunx wrangler r2 bucket create keystroke-logs
bunx wrangler kv namespace create SESSIONS_KV
bunx wrangler queues create keystroke-uploads
# Put the KV namespace ID from above into wrangler.jsonc
bunx wrangler deploy
```

### 2. Run the Client

**Linux / macOS:**
```bash
cd client
bash start.sh
```

**Windows PowerShell:**
```powershell
cd client
powershell -ExecutionPolicy Bypass -File start.ps1
```

**Or manually:**
```bash
cd client
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
export KM_API_URL="https://your-worker.your-subdomain.workers.dev"
python keylogger.py
```

Press `Ctrl+C` to stop.

### 3. Open the Dashboard

Go to `https://your-worker.your-subdomain.workers.dev/dashboard`

- **Sessions** — all capture sessions with chunk count, byte size, timestamps
- **Viewer** — full log output with search highlighting
- **Live Feed** — real-time WebSocket stream, keystrokes appear as they're typed

## Configuration

All client settings via environment variables:

| Variable | Default | Description |
|---|---|---|
| `KM_API_URL` | `http://localhost:8787` | Worker URL |
| `KM_CLIENT_ID` | hostname | Label shown in dashboard |
| `KM_BUFFER_LIMIT` | `200` | Max chars before forced flush |
| `KM_UPLOAD_INTERVAL` | `3` | Seconds of idle before flush |
| `KM_UPLOAD_RETRIES` | `2` | Retry attempts per upload |
| `KM_RETRY_DELAY` | `2.0` | Seconds between retries |
| `KM_TIMESTAMP_INTERVAL` | `5` | Minutes between timestamp markers |
| `KM_FALLBACK_DIR` | `./logs` | Local fallback directory |
| `KM_DEBUG` | `false` | Print to stdout instead of uploading |

## Project Structure

```
keystroke-monitor/
├── client/
│   ├── keylogger.py         # pynput capture + smart flush + background upload
│   ├── transport.py         # HTTP POST with retry + local JSON fallback
│   ├── config.py            # Environment variable configuration
│   ├── start.sh             # Linux/macOS startup script
│   ├── start.ps1            # Windows PowerShell startup script
│   └── requirements.txt     # pynput, requests
│
├── worker/
│   ├── src/
│   │   ├── index.ts         # Hono router, queue consumer, DO export
│   │   ├── types.ts         # TypeScript interfaces
│   │   ├── api/
│   │   │   ├── upload.ts    # POST /api/upload → Queue + DO broadcast
│   │   │   └── logs.ts      # GET/DELETE session and chunk endpoints
│   │   ├── lib/
│   │   │   └── storage.ts   # R2 chunk + KV session helpers
│   │   ├── durable/
│   │   │   └── stream-hub.ts # Durable Object WebSocket hub
│   │   └── dashboard/
│   │       ├── layout.tsx   # Base layout, nav, Tailwind config
│   │       ├── index.tsx    # Session list page
│   │       ├── viewer.tsx   # Log viewer with search
│   │       └── live.tsx     # Real-time WebSocket feed
│   ├── test/                # bun:test suite
│   ├── wrangler.jsonc       # Cloudflare bindings (R2, KV, DO, Queue)
│   └── package.json
│
├── LICENSE
└── README.md
```

## Tech Stack

| Layer | Technology |
|---|---|
| Keystroke Capture | Python 3.10+, [pynput](https://github.com/moses-palmer/pynput) |
| HTTP Client | [requests](https://docs.python-requests.org/) |
| Worker Runtime | [Cloudflare Workers](https://workers.cloudflare.com/) |
| Web Framework | [Hono](https://hono.dev/) with JSX SSR |
| Async Processing | [Cloudflare Queues](https://developers.cloudflare.com/queues/) |
| Real-time | [Durable Objects](https://developers.cloudflare.com/durable-objects/) (Hibernatable WebSocket API) |
| Object Storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) |
| Key-Value Store | [Cloudflare KV](https://developers.cloudflare.com/kv/) |
| Package Manager | [Bun](https://bun.sh/) |
| CSS | [Tailwind CSS](https://tailwindcss.com/) (CDN) |
| Font | [JetBrains Mono](https://www.jetbrains.com/lp/mono/) |
| Tests | [bun:test](https://bun.sh/docs/cli/test) |

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Submit a log chunk (enqueued, returns instantly) |
| `GET` | `/api/logs` | List all sessions (paginated) |
| `GET` | `/api/logs/:id` | Get session metadata + chunk list |
| `GET` | `/api/logs/:id/:chunk` | Retrieve a specific log chunk |
| `DELETE` | `/api/logs/:id` | Delete a session and all its chunks |
| `GET` | `/ws` | WebSocket upgrade for live streaming |
| `GET` | `/dashboard` | Session list (HTML) |
| `GET` | `/dashboard/view/:id` | Log viewer (HTML) |
| `GET` | `/dashboard/live` | Live keystroke feed (HTML) |

## Disclaimer

This project is for **authorized security testing and educational purposes only**.

It exists to teach how input monitoring works at the OS level, how cloud-native architectures handle real-time data at the edge, and how Cloudflare's platform primitives (Workers, R2, KV, Durable Objects, Queues) compose together.

**Do not use this software to monitor anyone without their explicit, informed consent.** Unauthorized keystroke logging is illegal in most jurisdictions and may constitute a criminal offense. The authors assume no liability for misuse.

## License

[MIT](LICENSE)
