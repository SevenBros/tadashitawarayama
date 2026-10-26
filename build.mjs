// Vercel build for tadashitawarayama.com
// The source (index.html + images/) stays plain HTML so the GitHub Pages preview and the
// iCloud copy keep working. This script writes Vercel's Build Output (.vercel/output):
//   - photos are served through Vercel Image Optimization (/_vercel/image), resized to the
//     screen and converted to WebP; the original files are never modified
//   - production-only head tags (indexing allowed, canonical, absolute link-preview image)
//   - any unknown path (old Squarespace URLs) redirects to the home page
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SITE = 'https://www.tadashitawarayama.com';
const OUT = '.vercel/output';
const STATIC = path.join(OUT, 'static');
const WIDTHS = [640, 1080, 1920, 3840];
const Q = 80;

const opt = (src, w) => `/_vercel/image?url=${encodeURIComponent('/' + decodeURI(src))}&w=${w}&q=${Q}`;
const srcset = src => WIDTHS.map(w => `${opt(src, w)} ${w}w`).join(', ');

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const e of await fs.readdir(from, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;   // .DS_Store, _作品メモ.txt
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) await copyDir(a, b); else await fs.copyFile(a, b);
  }
}

let html = await fs.readFile('index.html', 'utf8');

// ---- head: production tags ----
html = html.replace('<meta name="robots" content="noindex">\n', '');
html = html.replace(/<meta property="og:image" content="images\/([^"]+)">/,
  (_, f) => `<meta property="og:image" content="${SITE}/images/${f}">\n<meta property="og:url" content="${SITE}/">\n<meta property="og:type" content="website">\n<link rel="canonical" href="${SITE}/">`);

// ---- hero preload: responsive, optimized ----
html = html.replace(/<link rel="preload" as="image" href="images\/([^"]+)" fetchpriority="high">/,
  (_, f) => `<link rel="preload" as="image" href="${opt('images/' + f, 1920)}" imagesrcset="${srcset('images/' + f)}" imagesizes="(max-width:1024px) 200vw, 140vw" fetchpriority="high">`);

// ---- every photo: optimized src + srcset; data-full = large version for the full-screen viewer ----
let n = 0;
html = html.replace(/<img\b([^>]*?)\bsrc="(images\/[^"]+)"([^>]*)>/gs, (m, pre, src, post) => {
  n++;
  const attrs = pre + post;
  const sizes = /fetchpriority="high"/.test(attrs) ? '(max-width:1024px) 200vw, 140vw'
              : '(max-width:760px) 100vw, 50vw';
  return `<img${pre}src="${opt(src, 1920)}" srcset="${srcset(src)}" sizes="${sizes}" data-full="${opt(src, 3840)}"${post}>`;
});

// ---- viewer / series: use the large version ----
const swaps = [
  ["img.src = src.currentSrc || src.src;", "img.src = src.dataset.full || src.currentSrc || src.src;"],
  ["img.src = src.getAttribute('src');", "img.src = src.dataset.full || src.getAttribute('src');"],
];
for (const [a, b] of swaps) {
  if (!html.includes(a)) throw new Error('build: expected snippet not found: ' + a);
  html = html.replace(a, b);
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(STATIC, { recursive: true });
await fs.writeFile(path.join(STATIC, 'index.html'), html);
await copyDir('images', path.join(STATIC, 'images'));
for (const f of await fs.readdir('.')) if (/^google[0-9a-f]+\.html$/.test(f)) await fs.copyFile(f, path.join(STATIC, f));   // Search Console verification
await fs.writeFile(path.join(STATIC, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
await fs.writeFile(path.join(STATIC, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc></url></urlset>\n`);

await fs.writeFile(path.join(OUT, 'config.json'), JSON.stringify({
  version: 3,
  images: { sizes: WIDTHS, domains: [], formats: ['image/webp'], minimumCacheTTL: 2678400 },
  routes: [
    { handle: 'filesystem' },
    { src: '^/(?!_vercel/)(.+)$', status: 308, headers: { Location: '/' } },
  ],
}, null, 2));

console.log(`build: ${n} photos optimized → ${OUT}`);
