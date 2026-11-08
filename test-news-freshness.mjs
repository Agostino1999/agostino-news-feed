import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNewsFreshness} from './news-freshness.mjs';
import {extractArticlePublication,enrichArticle,enrichFeed} from './scripts/enrich-article-images.mjs';

const now=Date.parse('2026-11-08T10:38:00Z');
const article={title:"Luci d’Artista, confermata l'inaugurazione di sabato 7 novembre: con De Luca ci sarà Giuliana De Sio",pubDate:'Sun, 08 Nov 2026 10:22:02 GMT',dateSource:'google',source:'SalernoToday'};

test('the screenshot announcement expires despite a new Google timestamp',()=>{
  assert.equal(normalizeNewsFreshness(article,now),null);
  assert.ok(normalizeNewsFreshness({...article,title:article.title.replace('7 novembre','9 novembre')},now));
  assert.ok(normalizeNewsFreshness(article,Date.parse('2026-11-07T22:00:00Z'))===null); // future feed timestamp
  assert.ok(normalizeNewsFreshness({...article,pubDate:'2026-11-07T10:00:00Z'},Date.parse('2026-11-07T22:30:00Z')));
  assert.equal(normalizeNewsFreshness({...article,pubDate:'2026-11-07T10:00:00Z'},Date.parse('2026-11-07T23:01:00Z')),null); // midnight Rome
});

test('reports, new cancellations, future dates and multi-day events survive',()=>{
  for(const title of ["Luci d’Artista inaugurate il 7 novembre: le foto", "Confermata l'inaugurazione di sabato 7 novembre, ora rinviata", "Luci d’Artista: appuntamento dal 7 al 9 novembre", "Confermata l'inaugurazione il 7 novembre 2027", "Anniversario: il 7 novembre 2025 ci sarà spazio per il ricordo"]){
    assert.ok(normalizeNewsFreshness({...article,title},now),title);
  }
  assert.ok(normalizeNewsFreshness({...article,title:'Appuntamento il 5 gennaio',pubDate:'2026-12-30T10:00:00Z'},Date.parse('2027-01-02T10:00:00Z')));
  assert.ok(normalizeNewsFreshness({...article,title:'Il 7 novembre la protesta: tutti i dettagli'},now));
});

test('verified publication wins over discovery and invalid dates are rejected',()=>{
  const originalPubDate='2026-11-06T15:00:00Z';
  const result=normalizeNewsFreshness({...article,title:'Una notizia',dateSource:'original',originalPubDate},now);
  assert.equal(result.pubDate,originalPubDate);
  assert.equal(normalizeNewsFreshness({...article,pubDate:'invalid'},now),null);
});

test('metadata uses publication, never modification or unrelated schema dates',()=>{
  const html=`<meta property="article:modified_time" content="2026-11-08T10:22:00Z"><meta content="2026-11-06T16:00:00+01:00" property="article:published_time">`;
  assert.equal(extractArticlePublication(html,now),'2026-11-06T15:00:00.000Z');
  assert.equal(extractArticlePublication('<meta property="article:modified_time" content="2026-11-08T10:22:00Z">',now),'');
  assert.equal(extractArticlePublication('<script type="application/ld+json">{"@graph":[{"@type":"Organization","datePublished":"2000-01-01T10:00:00Z"},{"@type":"NewsArticle","datePublished":"2026-11-06T15:00:00Z"}]}</script>',now),'2026-11-06T15:00:00.000Z');
  assert.equal(extractArticlePublication('<meta property="article:published_time" content="2026-11-09T10:22:00Z">',now),'');
});

test('an existing photo does not skip verification of the publication date',async()=>{
  let calls=0;
  const result=await enrichArticle({...article,image:'https://example.com/photo.jpg',link:'https://example.com/story',sources:[{source:'SalernoToday',link:'https://example.com/story',pubDate:article.pubDate}]},{loadPage:async()=>{calls++;return {url:'https://example.com/story',html:'<meta property="article:published_time" content="2026-11-06T15:00:00Z">'};}});
  assert.equal(calls,1);
  assert.equal(result.dateSource,'original');
  assert.equal(result.pubDate,'2026-11-06T15:00:00.000Z');
  assert.equal(result.sources[0].pubDate,result.pubDate);
  assert.equal(result.image,'https://example.com/photo.jpg');
});

test('the next collection reuses verified dates even when the Google URL is the key',async()=>{
  const base={...article,title:'Una notizia',link:'https://news.google.com/rss/articles/example',image:'https://example.com/photo.jpg'};
  const previous={news:[{...base,originalURL:'https://example.com/story',originalPubDate:'2026-11-06T15:00:00Z',pubDate:'2026-11-06T15:00:00Z',dateSource:'original',publicationVerifiedKey:base.link}]};
  const result=await enrichFeed({news:[base]},previous,{deadlineMs:0});
  assert.equal(result.news[0].pubDate,'2026-11-06T15:00:00Z');
  assert.equal(result.news[0].originalURL,'https://example.com/story');
});
