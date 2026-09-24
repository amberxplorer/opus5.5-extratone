// Inlines css/style.css and every <script src> of index.html into one
// self-contained HTML body (for hosts that want a single file, e.g. an
// Artifact page, which supplies its own <!doctype>/<head>/<body> skeleton).
//   node tools/build-bundle.mjs [out.html] [--full-document]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.resolve(process.argv[2] || path.join(root, 'tools', 'out', 'fusionpoint-bundle.html'));
const fullDoc = process.argv.includes('--full-document');

const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const css = readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'FUSION POINT'])[1];
let body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
body = body.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = readFileSync(path.join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>/* ${src} */\n${js}</script>`;
});
const head = `<title>${title}</title>\n<style>\n${css}</style>\n`;
const out = fullDoc
  ? `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}</head>\n<body>${body}</body>\n</html>\n`
  : head + body;
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, out);
console.log(`wrote ${outPath} (${(out.length / 1024).toFixed(1)} KB)`);
