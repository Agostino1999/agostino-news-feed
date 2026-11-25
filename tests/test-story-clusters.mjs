import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterRelatedNews} from '../scripts/story-clusters.mjs';

const titles = [
  'Commenti identici sotto i post di Salvini, Fidanza e Nardella. La Lega: Eserciti di bot inquinano il confronto',
  'Commenti uguali sotto i post di Salvini e altri politici: è la rivolta dei bot. C’entra il down di Microsoft?',
  'Bot contro politici italiani sui social: attacchi a Lega, Fdi e Pd',
  'Bot intasano i post di Salvini, Nardella e Fidanza, la Lega: Vogliamo sapere chi c’è dietro',
  'Non posso insultare un partito: commenti misteriosi sui social di Salvini'
];
const article = (title, i=0, extra={}) => ({title, source: `Testata ${i}`, link: `https://testata${i}.it/articolo`,
  pubDate: new Date(Date.UTC(2026,10,14,17,40)-i*60000).toISOString(),dateSource:'original',
  categories:['Lega'],image:`https://testata${i}.it/photo.jpg`,...extra});

test('headlines about the same political bot incident become one card with all publishers', () => {
  const input=titles.map((title,i)=>article(title,i));
  const before=JSON.stringify(input),result=clusterRelatedNews(input);
  assert.equal(result.length,1);
  assert.equal(result[0].sourceCount,5);
  assert.equal(result[0].title,input[0].title);
  assert.equal(result[0].pubDate,input[0].pubDate);
  assert.equal(result[0].image,input[0].image);
  assert.equal(JSON.stringify(input),before);
  assert.deepEqual(clusterRelatedNews(result),result);
});

test('the same publisher is counted once, with a resolved link preferred to Google', () => {
  const a=article(titles[0],0,{source:'Corriere della Sera',link:'https://roma.corriere.it/politica/bot.shtml'});
  const b=article(titles[1],1,{source:'Corriere Roma',link:'https://news.google.com/rss/articles/123',sourceHomepage:'https://roma.corriere.it'});
  const result=clusterRelatedNews([a,b]);
  assert.equal(result.length,1);
  assert.equal(result[0].sourceCount,1);
  assert.equal(result[0].sources[0].link,a.link);
});

test('a later incident, videogame bots and different political events stay separate', () => {
  const input=[article(titles[0]),
    article(titles[1],1,{pubDate:'2026-11-13T09:00:00Z'}),
    article('Videogiochi, nuovi bot per i tornei online',2),
    article('Salvini annuncia nuovi controlli sui treni della Lega',3)];
  assert.equal(clusterRelatedNews(input).length,4);
});

test('different casualty numbers keep otherwise similar incidents separate', () => {
  const a=article('Roma, incendio in un appartamento: 2 persone salvate dai vigili',0);
  const b=article('Roma, incendio in un appartamento: 5 persone salvate dai vigili',1);
  assert.equal(clusterRelatedNews([a,b]).length,2);
});

test('recent Google dates keep their provenance, timestamps and image when sources merge', () => {
  const a=article(titles[0],0,{dateSource:'google'}),b=article(titles[2],1);
  const result=clusterRelatedNews([a,b])[0];
  assert.equal(result.dateSource,'google');
  assert.equal(result.pubDate,a.pubDate);
  assert.equal(result.sources.length,2);
});

test('the Tavolo Asilo proposal announcement groups different titles and keeps both links', () => {
  const a=article('Per una nuova stagione di diritti: presentato a Roma il documento del Tavolo Asilo e Immigrazione con le 10 proposte alle forze politiche per la gestione del fenomeno migratorio in vista delle prossime elezioni',0,
    {source:'Centro Astalli',link:'https://www.centroastalli.it/10-proposte-tavolo-asilo-immigrazione/',pubDate:'2026-11-25T10:32:52Z',categories:['Immigrazione']});
  const b=article('Immigrazione, le dieci proposte del Tavolo Asilo ai partiti',1,
    {source:'DiariodelWeb.it',link:'https://diariodelweb.it/politica/tavolo-asilo-proposte-immigrazione-parlamento/',pubDate:'2026-11-24T18:02:58Z',categories:['Politica']});
  const unrelated=article('Accoglienza, il Tavolo Asilo chiede chiarimenti sui centri di rimpatrio',2,
    {pubDate:'2026-11-25T09:00:00Z',categories:['Immigrazione']});
  const cards=clusterRelatedNews([b,unrelated,a]);
  assert.equal(cards.length,2);
  assert.deepEqual(cards[0].sources.map(source=>source.link),[a.link,b.link]);
  assert.deepEqual(cards[0].categories,['Immigrazione','Politica']);
  assert.equal(cards[1].title,unrelated.title);
});
