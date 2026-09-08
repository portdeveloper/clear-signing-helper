import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Rendering } from './fixtures.js';
import { displayText } from './output.js';

export const escapeHtml = (s: unknown) => displayText(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]!));
export function previewHtml(r: Rendering) {
  const rows = (fields: any[]): string => fields.map(f => f.fields ? `<section>${f.label ? `<h3>${escapeHtml(f.label)}</h3>` : ''}${rows(f.fields)}</section>` : `${f.separator ? `<h3>${escapeHtml(f.separator)}</h3>` : ''}<div class="field"><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}${f.rawAddress && f.rawAddress !== f.value ? `<small>${escapeHtml(f.rawAddress)}</small>` : ''}${f.tokenAddress ? `<small>Token: ${escapeHtml(f.tokenAddress)}</small>` : ''}</dd></div>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Clear signing preview</title><style>
  :root{color-scheme:light dark;font-family:system-ui,sans-serif;background:#111719;color:#edf3ee}body{max-width:760px;margin:4rem auto;padding:0 1.5rem}header{color:#a3d7bc;letter-spacing:.08em;font-size:.8rem;text-transform:uppercase}h1{font-size:2.5rem;margin:.6rem 0 2rem}.card{background:#1b2528;border:1px solid #34433c;border-radius:20px;padding:1.5rem}.field{padding:1rem 0;border-bottom:1px solid #34433c}dt{color:#acb9b2;font-size:.9rem}dd{margin:.5rem 0 0;font-size:1.2rem;overflow-wrap:anywhere}small{display:block;color:#acb9b2;font-size:.8rem;margin-top:.4rem}.context{font-size:.9rem;overflow-wrap:anywhere;line-height:1.7}.warning{color:#ffd68d}footer{color:#acb9b2;margin-top:2rem;font-size:.85rem;line-height:1.6}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;margin-top:1rem}</style>
  <header>Clear Signing Helper · Reference preview</header><h1>${escapeHtml(r.intent)}</h1><main class="card"><p class="context">${r.localBinding ? 'Local draft · ' : ''}Chain ${r.chainId}<br>Target: ${escapeHtml(r.to)}<br>Native value: ${escapeHtml(r.value)} wei${r.from ? `<br>From: ${escapeHtml(r.from)}` : ''}</p><dl>${rows(r.fields)}</dl>${r.warnings.map(w => `<p class="warning">${escapeHtml(w.code)}: ${escapeHtml(w.message)}</p>`).join('')}</main><footer>${escapeHtml(r.contract)} · ${escapeHtml(r.signature)}<br>Local reference rendering. Wallet layouts and supported features may differ. This preview does not execute the transaction.</footer><details><summary>Normalized output</summary><pre>${escapeHtml(JSON.stringify(r, null, 2))}</pre></details></html>`;
}
export async function servePreview(r: Rendering, open: boolean): Promise<{url: string; close: () => void}> {
  const token = randomBytes(16).toString('hex');
  const html = previewHtml(r);
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== `/${token}`) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"});
    res.end(html);
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address() as {port: number};
  const url = `http://127.0.0.1:${address.port}/${token}`;
  if (open) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    const child = spawn(cmd, [url], {stdio:'ignore', detached:true});
    child.on('error', () => {}); child.unref();
  }
  return {url, close: () => server.close()};
}
