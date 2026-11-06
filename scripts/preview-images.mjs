import fs from 'node:fs/promises';
import dns from 'node:dns/promises';
import net from 'node:net';

const headers = { 'user-agent': 'Mozilla/5.0 (compatible; NewsPreview/1.0)' };
const safeUrl = value => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return '';
    if (/^(localhost|\d+\.|\[|.*\.local$)/i.test(url.hostname)) return '';
    return url.href;
  } catch { return ''; }
};

async function getHtml(url) {
  let response;
  for (let n = 0; n < 5; n++) {
    const parsed = new URL(safeUrl(url));
    const addresses = await dns.lookup(parsed.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => {
      if (net.isIP(address) === 6) return /^(::|fc|fd|fe80|::ffff:)/i.test(address);
      const [a,b] = address.split('.').map(Number);
      return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    })) throw new Error('unsafe network address');
    response = await fetch(parsed.href, { headers, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      await response.body?.cancel();
      if (!next) throw new Error('redirect without location');
      url = safeUrl(new URL(next, parsed.href).href);
      if (!url) throw new Error('unsafe redirect');
      continue;
    }
    break;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('html')) throw new Error('not HTML');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < 700000) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return { response, html: Buffer.concat(chunks).toString('utf8').slice(0, 700000) };
}

async function resolveGoogle(article, html) {
  const sig = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="(\d+)"/)?.[1];
  const id = html.match(/data-n-a-id="([^"]+)"/)?.[1];
  if (!sig || !ts || !id) throw new Error('Google parameters unavailable');
  const conf = [['X','X',['X','X'],null,null,1,1,'US:en',null,1,null,null,null,null,null,0,1],'X','X',1,[1,1,1],1,1,null,0,0,null,0];
  const inner = JSON.stringify(['garturlreq',conf,id,Number(ts),sig]);
  const form = new URLSearchParams({ 'f.req': JSON.stringify([[['Fbv4je',inner]]]) });
  const rpc = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: form, signal: AbortSignal.timeout(10000)
  });
  if (!rpc.ok) throw new Error(`Google RPC ${rpc.status}`);
  const body = await rpc.text();
  const row = body.split('\n').find(line => line.startsWith('[["wrb.fr"'));
  const data = row ? JSON.parse(row)?.[0]?.[2] : null;
  const url = safeUrl(data ? JSON.parse(data)?.[1] : '');
  if (!url) throw new Error('Google destination unavailable');
  return url;
}

function extractMetaImage(html, pageUrl) {
  for (const [name, value] of [['&amp;', '&'], ['&quot;', '"'], ['&#39;', "'"]]) html = html.replaceAll(name, value);
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]);
  const tag = tags.find(t => /\b(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["']/i.test(t));
  const match = tag?.match(/\bcontent\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
  try { return safeUrl(new URL(match?.[1] || match?.[2] || '', pageUrl).href); } catch { return ''; }
}

async function inspect(article) {
  const result = { title: article.title, source: article.source, image: '', status: '' };
  const candidates = [...new Set([article.originalURL || article.link, ...(article.sources || []).map(source => source.originalURL || source.link)].filter(Boolean))];
  for (const candidate of candidates) {
    try {
      let url = safeUrl(candidate);
      if (!url) throw new Error('invalid URL');
      let page = await getHtml(url);
      if (new URL(page.response.url).hostname === 'news.google.com') {
        url = await resolveGoogle(article, page.html);
        page = await getHtml(url);
      }
      const image = extractMetaImage(page.html, page.response.url);
      if (!image || image === page.response.url) {
        result.pageHost = new URL(page.response.url).hostname;
        result.imageTags = [...page.html.matchAll(/<img\b[^>]*>/gi)].slice(0, 8).map(m => m[0].slice(0, 450));
        throw new Error('no article image metadata');
      }
      result.image = image;
      result.status = candidate === candidates[0] ? 'image metadata' : 'alternate source metadata';
      break;
    } catch (e) { result.status = String(e.message || e).slice(0, 100); }
  }
  return result;
}

const feed = JSON.parse(await fs.readFile('news.json', 'utf8'));
const items = feed.news.filter(a => !a.image && ['Opinione Agenzia Giornalistica', 'AGI'].includes(a.source)).slice(0, 12);
const results = new Array(items.length);
let position = 0;
async function worker() {
  while (position < items.length) {
    const index = position++;
    results[index] = await inspect(items[index]);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
for (const r of results) console.log(JSON.stringify(r));
const success = results.filter(r => r.image).length;
const statuses = {};
for (const r of results) statuses[r.status] = (statuses[r.status] || 0) + 1;
console.log('SUMMARY ' + JSON.stringify({ total: feed.news.length, present: feed.news.length - items.length, tested: items.length, recovered: success, missing: items.length - success, statuses }));
