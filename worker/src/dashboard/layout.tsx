import type { FC, PropsWithChildren } from "hono/jsx";

interface LayoutProps {
  title?: string;
  script?: string;
  activeTab?: "sessions" | "live";
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({ title, script, activeTab, children }) => {
  const pageTitle = title ? `${title} | Keystroke Monitor` : "Keystroke Monitor";

  return (
    <html lang="en" class="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{pageTitle}</title>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a78bfa' stroke-width='2' stroke-linecap='round'><rect x='2' y='4' width='20' height='16' rx='2'/><line x1='6' y1='12' x2='6' y2='12.01'/><line x1='10' y1='12' x2='10' y2='12.01'/><line x1='14' y1='12' x2='14' y2='12.01'/><line x1='18' y1='12' x2='18' y2='12.01'/><line x1='8' y1='16' x2='16' y2='16'/></svg>" />
        <script src="https://cdn.tailwindcss.com"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                darkMode: 'class',
                theme: {
                  extend: {
                    colors: {
                      bg: { DEFAULT: '#09090b', card: '#111113', hover: '#18181b', border: '#27272a' },
                      accent: { DEFAULT: '#a78bfa', dim: '#7c3aed', glow: 'rgba(167,139,250,0.15)' },
                      lime: { DEFAULT: '#a3e635', dim: '#65a30d', glow: 'rgba(163,230,53,0.12)' },
                    },
                    fontFamily: {
                      mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
                      sans: ['Inter', 'system-ui', 'sans-serif'],
                    },
                    animation: {
                      'fade-up': 'fadeUp 0.4s ease-out',
                      'slide-in': 'slideIn 0.3s ease-out',
                      'pulse-dot': 'pulseDot 2s ease-in-out infinite',
                      'glow': 'glow 2s ease-in-out infinite alternate',
                    },
                    keyframes: {
                      fadeUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
                      slideIn: { '0%': { opacity: '0', transform: 'translateX(-8px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
                      pulseDot: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
                      glow: { '0%': { boxShadow: '0 0 5px rgba(167,139,250,0.2), 0 0 20px rgba(167,139,250,0.1)' }, '100%': { boxShadow: '0 0 10px rgba(167,139,250,0.3), 0 0 40px rgba(167,139,250,0.15)' } },
                    },
                  }
                }
              }
            `,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');

              * { scrollbar-width: thin; scrollbar-color: #27272a transparent; }
              ::-webkit-scrollbar { width: 6px; }
              ::-webkit-scrollbar-track { background: transparent; }
              ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 3px; }

              .glass { background: rgba(17,17,19,0.7); backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%); }
              .gradient-border { position: relative; }
              .gradient-border::before {
                content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
                background: linear-gradient(135deg, rgba(167,139,250,0.3), transparent 50%, rgba(163,230,53,0.2));
                -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
              }
              .keystroke-flash { animation: flash 0.3s ease-out; }
              @keyframes flash { 0% { color: #a3e635; text-shadow: 0 0 8px rgba(163,230,53,0.5); } 100% { color: #d4d4d8; text-shadow: none; } }
              .stagger > * { animation: fadeUp 0.4s ease-out backwards; }
              .stagger > *:nth-child(1) { animation-delay: 0.03s; }
              .stagger > *:nth-child(2) { animation-delay: 0.06s; }
              .stagger > *:nth-child(3) { animation-delay: 0.09s; }
              .stagger > *:nth-child(4) { animation-delay: 0.12s; }
              .stagger > *:nth-child(5) { animation-delay: 0.15s; }
              .stagger > *:nth-child(6) { animation-delay: 0.18s; }
              .stagger > *:nth-child(7) { animation-delay: 0.21s; }
              .stagger > *:nth-child(8) { animation-delay: 0.24s; }
              .stagger > *:nth-child(n+9) { animation-delay: 0.27s; }
            `,
          }}
        />
      </head>
      <body class="bg-bg text-zinc-300 min-h-screen font-sans antialiased">
        {/* ── Nav ── */}
        <nav class="glass sticky top-0 z-50 border-b border-bg-border/50">
          <div class="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
            <div class="flex items-center gap-6">
              <a href="/dashboard" class="flex items-center gap-2.5 group">
                <div class="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="text-accent">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <line x1="6" y1="12" x2="6" y2="12.01" />
                    <line x1="10" y1="12" x2="10" y2="12.01" />
                    <line x1="14" y1="12" x2="14" y2="12.01" />
                    <line x1="18" y1="12" x2="18" y2="12.01" />
                    <line x1="8" y1="16" x2="16" y2="16" />
                  </svg>
                </div>
                <span class="font-semibold text-white text-[15px] tracking-tight">Keystroke Monitor</span>
              </a>
              <div class="flex items-center gap-1">
                <a
                  href="/dashboard"
                  class={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                    activeTab === "sessions"
                      ? "bg-white/[0.07] text-white"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                  }`}
                >
                  Sessions
                </a>
                <a
                  href="/dashboard/live"
                  class={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-all flex items-center gap-1.5 ${
                    activeTab === "live"
                      ? "bg-white/[0.07] text-white"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                  }`}
                >
                  <span class={`w-1.5 h-1.5 rounded-full ${activeTab === "live" ? "bg-lime animate-pulse-dot" : "bg-zinc-600"}`} />
                  Live
                </a>
              </div>
            </div>
            <span class="text-[11px] font-mono text-zinc-600">v2.0</span>
          </div>
        </nav>

        <main class="max-w-6xl mx-auto px-5 py-8">
          {children}
        </main>

        {script && (
          <script
            type="module"
            dangerouslySetInnerHTML={{ __html: script }}
          />
        )}
      </body>
    </html>
  );
};
