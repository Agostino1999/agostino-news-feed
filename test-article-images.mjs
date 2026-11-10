import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichFeed,extractArticlePhoto} from './scripts/enrich-article-images.mjs';

test('all missing photos are recovered before checking dates on illustrated stories',async()=>{
  const now=new Date(Date.now()-60000).toISOString();
  const story=(title,image='')=>({title,link:'https://www.ansa.it/'+title,pubDate:now,image,dateSource:image?'google':'original'});
  const feed={news:[story('photo-already-present','https://www.ansa.it/old.jpg'),story('missing-photo')]};
  const visited=[];
  const enriched=await enrichFeed(feed,null,{concurrency:1,loadPage:async url=>{
    visited.push(url);
    return {url,html:'<meta property="og:image" content="https://www.ansa.it/new.jpg">'};
  }});
  assert.equal(visited[0],'https://www.ansa.it/missing-photo');
  assert.ok(enriched.news.every(a=>a.image));
  const second=await enrichFeed({news:[story('missing-photo')]},enriched,{loadPage:async()=>{throw Error('unavailable')}});
  assert.equal(second.news[0].image,'https://www.ansa.it/new.jpg');
});

test('video metadata supplies the article thumbnail when image meta tags are absent',()=>{
  const html='<script type="application/ld+json">{"@type":"VideoObject","thumbnailUrl":["/video.jpg"]}</script>';
  assert.equal(extractArticlePhoto(html,'https://www.ansa.it/story'),'https://www.ansa.it/video.jpg');
});
