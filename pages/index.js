// =============================
// TorBox Torrent Finder
// Next.js 14 (App Router) + TailwindCSS
// Features:
// - Search torrents (TorBox Search API + optional 1337x/TPB via torrent-search-api)
// - Filter by Cached ✅ / Uncached ❌ / All
// - Add to TorBox (Create Torrent)
// - Shows size, seeds, peers, and source
// - "Remember me": stores your TorBox API key in localStorage (browser only)
// - Free hosting on Vercel (serverless API routes do cross-origin + keep your key off the client request logs)
//
// IMPORTANT:
// - This repository is laid out as a single file here. Create the file structure locally matching the paths below.
// - Providers scraped via `torrent-search-api` can be flaky (sites move). TorBox Search API is stable and rate-limited.
// - You are responsible for what you search/download. Use legal content only.
// =============================

/*
Directory tree
.
├── package.json
├── next.config.mjs
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── .gitignore
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── magnets.ts
│   └── providers.ts
├── app/api/search/route.ts
├── app/api/check-cached/route.ts
├── app/api/add/route.ts
*/

// =============================
// package.json
// =============================
export const pkg = `{
  "name": "torbox-torrent-finder",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "clsx": "2.1.1",
    "magnet-uri": "7.0.4",
    "zod": "3.23.8",
    "@torbox/torbox-api": "^0.6.0"
  },
  "devDependencies": {
    "autoprefixer": "10.4.19",
    "postcss": "8.4.38",
    "tailwindcss": "3.4.6",
    "typescript": "5.4.5",
    "eslint": "8.57.0"
  }
}`

// =============================
// next.config.mjs
// =============================
export const nextConfig = `/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { allowedOrigins: ["*"] } },
};
export default nextConfig;`;

// =============================
// postcss.config.js
// =============================
export const postcss = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};`;

// =============================
// tailwind.config.js
// =============================
export const tailwind = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};`;

// =============================
// tsconfig.json
// =============================
export const tsconfig = `{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}`

// =============================
// app/globals.css
// =============================
export const globals = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n
:root { color-scheme: dark; }
html, body { height: 100%; }
body { @apply bg-neutral-950 text-neutral-100; }
.input { @apply w-full px-4 py-3 rounded-2xl bg-neutral-900 outline-none ring-1 ring-neutral-800 focus:ring-neutral-600; }
.btn { @apply px-4 py-2 rounded-2xl shadow hover:shadow-lg transition shadow-neutral-900/50 ring-1 ring-neutral-800 bg-neutral-900 hover:bg-neutral-800; }
.card { @apply rounded-2xl p-4 ring-1 ring-neutral-800 bg-neutral-900; }
.badge { @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ring-1 ring-neutral-700; }
`;

// =============================
// app/layout.tsx
// =============================
export const layout = `import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TorBox Torrent Finder',
  description: 'Search torrents, filter cached, and add to TorBox',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}`

// =============================
// lib/magnets.ts (helpers to get infoHash from magnet)
// =============================
export const magnets = `import magnet from 'magnet-uri';

export function toInfoHash(magnetLink: string): string | null {
  try {
    const parsed = magnet(magnetLink);
    if (parsed?.infoHash) return parsed.infoHash.toLowerCase();
    return null;
  } catch {
    return null;
  }
}
`;

// =============================
// lib/providers.ts — map sources + pretty labels
// =============================
export const providers = `export type Source = 'torbox' | '1337x' | 'tpb';
export const SOURCE_LABEL: Record<Source, string> = {
  torbox: 'TorBox (multi-indexer)',
  '1337x': '1337x',
  tpb: 'The Pirate Bay',
};
`;

// =============================
// app/api/search/route.ts
// - Uses TorBox Search API by default (no auth)
// - Optional provider param to use 1337x or TPB via simple HTML scrapes (server) if TorBox search is not enough
// =============================
export const apiSearch = `import { NextRequest } from 'next/server';
import { z } from 'zod';

const TB_BASE = 'https://search-api.torbox.app';

const QuerySchema = z.object({
  q: z.string().min(1),
  provider: z.enum(['torbox', '1337x', 'tpb']).default('torbox'),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parse = QuerySchema.safeParse({
    q: searchParams.get('q') || '',
    provider: (searchParams.get('provider') as any) || 'torbox',
    limit: Number(searchParams.get('limit') || '50'),
  });
  if (!parse.success) return new Response(JSON.stringify({ error: 'Bad query' }), { status: 400 });
  const { q, provider, limit } = parse.data;

  try {
    if (provider === 'torbox') {
      const r = await fetch(`${TB_BASE}/torrents/search/${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error('TorBox search failed');
      const data = await r.json();
      // Normalize
      const items = (data?.results || data || []).slice(0, limit).map((t: any) => ({
        title: t.title || t.name,
        magnet: t.magnet || t.magnet_link || t.magnetURI,
        size: t.size || t.filesize || null,
        seeders: t.seeders ?? t.seeds ?? null,
        leechers: t.leechers ?? t.peers ?? null,
        source: t.source || t.provider || 'TorBox',
      })).filter((x: any) => x.magnet);
      return Response.json({ items });
    }

    // Minimal fallbacks for 1337x / TPB using JSON mirrors (if available)
    // NOTE: These mirrors can break. TorBox search is recommended.
    if (provider === '1337x') {
      const r = await fetch(`https://r.jina.ai/http://1337x.to/search/${encodeURIComponent(q)}/1/`);
      const html = await r.text();
      const rows = [...html.matchAll(/<tr>\s*<td class=\"coll-1\">.*?<a href=\"(.*?)\">(.*?)<\/a>[\s\S]*?class=\"coll-2.*?>(.*?)<\/td>[\s\S]*?class=\"coll-3.*?>(\d+)<\/td>[\s\S]*?class=\"coll-4.*?>(\d+)<\/td>/g)];
      const items: any[] = [];
      for (const m of rows.slice(0, limit)) {
        const title = decodeHTMLEntities(m[2]);
        const detail = 'https://1337x.to' + m[1];
        try {
          const d = await fetch(`https://r.jina.ai/${detail}`);
          const dhtml = await d.text();
          const magnet = (dhtml.match(/href=\"(magnet:[^\"]+)/)?.[1]) || null;
          if (magnet) items.push({ title, magnet, size: m[3]?.trim() || null, seeders: Number(m[4]), leechers: Number(m[5]), source: '1337x' });
        } catch {}
      }
      return Response.json({ items });
    }

    if (provider === 'tpb') {
      const r = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=0`);
      const data = await r.json();
      const items = (Array.isArray(data) ? data : []).slice(0, limit).map((t: any) => ({
        title: t.name,
        magnet: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(t.name)}`,
        size: Number(t.size),
        seeders: Number(t.seeders),
        leechers: Number(t.leechers),
        source: 'The Pirate Bay',
      }));
      return Response.json({ items });
    }

    return new Response('Unknown provider', { status: 400 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

function decodeHTMLEntities(text: string) {
  return text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)).replace(/&amp;/g, '&');
}
`;

// =============================
// app/api/check-cached/route.ts
// - Proxies to TorBox: GET /v1/api/torrents/checkcached?hash=... (Bearer token)
// =============================
export const apiCheck = `import { NextRequest } from 'next/server';

const TB_API = 'https://api.torbox.app/v1/api/torrents/checkcached';

export async function POST(req: NextRequest) {
  const { hashes } = await req.json(); // array of infoHashes
  const token = req.headers.get('authorization');
  if (!token) return new Response('Missing Authorization', { status: 401 });
  if (!Array.isArray(hashes) || hashes.length === 0) return new Response('No hashes', { status: 400 });

  const url = new URL(TB_API);
  // TorBox lets multiple hash params or comma-separated; we add multiple params for simplicity
  for (const h of hashes) url.searchParams.append('hash', String(h));
  url.searchParams.set('format', 'object');

  const r = await fetch(url.toString(), {
    headers: { Authorization: token },
    cache: 'no-store',
  });
  const text = await r.text();
  try {
    return new Response(text, { status: r.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Upstream error', detail: text }), { status: 500 });
  }
}
`;

// =============================
// app/api/add/route.ts
// - Proxies to TorBox: POST /v1/api/torrents/createtorrent (Bearer token)
// =============================
export const apiAdd = `import { NextRequest } from 'next/server';

const TB_CREATE = 'https://api.torbox.app/v1/api/torrents/createtorrent';

export async function POST(req: NextRequest) {
  const { magnet } = await req.json();
  const token = req.headers.get('authorization');
  if (!token) return new Response('Missing Authorization', { status: 401 });
  if (!magnet) return new Response('Missing magnet', { status: 400 });

  const r = await fetch(TB_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ magnet_link: magnet }),
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { 'content-type': 'application/json' } });
}
`;

// =============================
// app/page.tsx — UI
// =============================
export const page = `"use client";
import { useEffect, useMemo, useState } from 'react';
import { toInfoHash } from '@/lib/magnets';
import { SOURCE_LABEL } from '@/lib/providers';

type Item = { title: string; magnet: string; size: number | string | null; seeders: number | null; leechers: number | null; source: string };

type Filter = 'all' | 'cached' | 'uncached';

default function Page() {
  const [apiKey, setApiKey] = useState('');
  const [remember, setRemember] = useState(true);
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<'torbox' | '1337x' | 'tpb'>('torbox');
  const [items, setItems] = useState<Item[]>([]);
  const [cacheMap, setCacheMap] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);

  // Load/save API key
  useEffect(() => {
    const k = localStorage.getItem('torbox_key');
    if (k) setApiKey(k);
  }, []);
  useEffect(() => {
    if (remember && apiKey) localStorage.setItem('torbox_key', apiKey);
    if (!remember) localStorage.removeItem('torbox_key');
  }, [remember, apiKey]);

  const visible = useMemo(() => {
    return items.filter((it) => {
      if (filter === 'all') return true;
      const h = toInfoHash(it.magnet);
      const cached = h ? cacheMap[h] : false;
      return filter === 'cached' ? cached : !cached;
    });
  }, [items, cacheMap, filter]);

  async function doSearch() {
    setLoading(true);
    setCacheMap({});
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&provider=${provider}&limit=50`);
      const { items: found } = await r.json();
      setItems(found || []);
      // kick off cache check if we have a key
      if (apiKey && found?.length) {
        const hashes = found.map((x: Item) => toInfoHash(x.magnet)).filter(Boolean) as string[];
        if (hashes.length) {
          const res = await fetch('/api/check-cached', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ hashes }),
          });
          const data = await res.json();
          // data looks like: { "<hash>": { cached: true, ... }, ... }
          const next: Record<string, boolean> = {};
          for (const [k, v] of Object.entries<any>(data?.data || data || {})) next[k.toLowerCase()] = !!(v as any)?.cached;
          setCacheMap(next);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function addToTorBox(magnet: string) {
    if (!apiKey) { alert('Add your TorBox API key first.'); return; }
    const r = await fetch('/api/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ magnet }),
    });
    if (!r.ok) {
      const t = await r.text();
      alert('Add failed: ' + t);
    } else {
      alert('Added to TorBox!');
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">TorBox Torrent Finder</h1>
        <p className="text-neutral-400 text-sm">Search torrents, filter cached vs uncached, and send them to TorBox.</p>
      </header>

      <section className="grid md:grid-cols-3 gap-3 items-center">
        <input className="input md:col-span-2" placeholder="Search title or keywords… (e.g. Nature Documentary 4K)" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key==='Enter' && doSearch()} />
        <button className="btn" onClick={doSearch} disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </section>

      <section className="grid md:grid-cols-3 gap-3">
        <div className="card space-y-3">
          <div className="text-sm font-semibold">Provider</div>
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value as any)}>
            <option value="torbox">{SOURCE_LABEL.torbox}</option>
            <option value="1337x">{SOURCE_LABEL['1337x']}</option>
            <option value="tpb">{SOURCE_LABEL.tpb}</option>
          </select>
          <div className="text-xs text-neutral-400">TorBox (recommended) aggregates multiple public sources. The site scrapers can break sometimes.</div>
        </div>

        <div className="card space-y-3">
          <div className="text-sm font-semibold">Filter</div>
          <div className="flex gap-2">
            <button className={`btn ${filter==='all' && 'ring-2 ring-neutral-500'}`} onClick={() => setFilter('all')}>All</button>
            <button className={`btn ${filter==='cached' && 'ring-2 ring-green-600'}`} onClick={() => setFilter('cached')}>Cached ✅</button>
            <button className={`btn ${filter==='uncached' && 'ring-2 ring-red-600'}`} onClick={() => setFilter('uncached')}>Uncached ❌</button>
          </div>
          <div className="text-xs text-neutral-400">Cache status requires your TorBox API key.</div>
        </div>

        <div className="card space-y-2">
          <div className="text-sm font-semibold">TorBox API key</div>
          <input className="input" placeholder="Paste your TorBox API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me (stores in this browser)</label>
          <div className="text-xs text-neutral-400">Your key is stored locally in your browser. Never share it.</div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Results ({visible.length})</h2>
        </div>

        <div className="grid gap-3">
          {visible.map((it, idx) => {
            const hash = toInfoHash(it.magnet);
            const cached = hash ? cacheMap[hash] : false;
            return (
              <div key={idx} className="card flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-medium">{it.title}</div>
                  <div className="text-xs text-neutral-400 flex gap-2 items-center">
                    <span className="badge">{it.source}</span>
                    {typeof it.size !== 'object' && it.size ? <span className="badge">{formatSize(it.size)}</span> : null}
                    <span className="badge">Seeds: {it.seeders ?? '—'}</span>
                    <span className="badge">Peers: {it.leechers ?? '—'}</span>
                    {hash ? <span className={`badge ${cached ? 'ring-green-600' : 'ring-red-600'}`}>{cached ? 'Cached ✅' : 'Not cached ❌'}</span> : <span className="badge">Hash unknown</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <a className="btn" href={it.magnet}>Open Magnet</a>
                  <button className="btn" onClick={() => addToTorBox(it.magnet)}>Dump to TorBox</button>
                </div>
              </div>
            );
          })}
          {!visible.length && <div className="text-neutral-400">No results yet. Try a different search or provider.</div>}
        </div>
      </section>
    </main>
  );
}

function formatSize(s: any) {
  const n = typeof s === 'number' ? s : Number(String(s).replace(/[^\d]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return String(s);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let x = n, i = 0; while (x >= 1024 && i < units.length-1) { x/=1024; i++; }
  return x.toFixed(2) + ' ' + units[i];
}
`
