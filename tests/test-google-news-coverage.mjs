import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Google orders search feeds by relevance. The newest item can be past item 25.
for (const [path, endMarker] of [
  ['scripts/generate-news.mjs', '\nfunction directLink'],
  ['scripts/add-video-news.mjs', '\nasync function fetchVideoQuery'],
  ['scripts/enrich-focus-news.mjs', '\nasync function fetchQuery']
]) {
  test(`${path} conserva anche gli aggiornamenti dopo il venticinquesimo risultato`, () => {
    const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const start = source.indexOf('function parseGoogle(');
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start);
    const box = {
      tag: (item, name) => item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] || '',
      stripSource: title => title,
      sourceFromTitle: () => 'ANSA',
      decodeEntities: value => value,
      extractFeedImage: () => '',
      isBlockedSource: () => false
    };
    vm.createContext(box);
    vm.runInContext(source.slice(start, end), box);
    const items = Array.from({length: 40}, (_, i) => `<item><title>Salvini aggiornamento ${i}</title><source>ANSA</source><link>https://example.com/${i}</link><pubDate>${new Date(Date.UTC(2026, 10, 15, 12, i)).toISOString()}</pubDate><description>Politica</description></item>`);
    const result = box.parseGoogle(`<rss><channel>${items.join('')}</channel></rss>`, 'Lega');
    assert.equal(result.length, 40);
    assert.equal(result[0].title, 'Salvini aggiornamento 39');
    assert.equal(result.at(-1).title, 'Salvini aggiornamento 0');
  });
}
