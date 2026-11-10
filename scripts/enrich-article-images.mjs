import fs from 'node:fs/promises';
import { normalizeNewsFreshness } from '../news-freshness.mjs';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const blocked = new net.BlockList();
for (const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(ip,bits,'ipv4');
for (const [ip,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]]) blocked.addSubnet(ip,bits,'ipv6');

function publicUrl(value, base) {
  try {
    const u = new URL(value, base);
    if (!['http:','https:'].includes(u.protocol) || u.username || u.password || u.port || net.isIP(u.hostname.replace(/^\[|\]$/g,''))) return '';
    if (u.hostname === 'localhost' || u.hostname.endsWith('.local')) return '';
    return u.href;
  } catch { return ''; }
}

function fetchPage(value, {method='GET',body='',limit=650000,timeout=7000} = {}, depth=0) {
  const url = publicUrl(value);
  if (!url || depth > 4) return Promise.reject(new Error('invalid redirect'));
  return new Promise((resolve,reject) => {
    let done = false;
    let timer;
    const finish = (err,value) => { if(done)return; done=true; clearTimeout(timer); err ? reject(err) : resolve(value); };
    const u = new URL(url);
    const req = (u.protocol === 'https:' ? https : http).request(u, {
      method,
      headers: {'user-agent':'Mozilla/5.0 (compatible; AgostinoNews/1.0)',accept:'text/html,application/xhtml+xml,*/*;q=0.5',...(body ? {'content-type':'application/x-www-form-urlencoded;charset=UTF-8'} : {})},
      lookup(host,options,callback) {
        dns.lookup(host,{all:true,verbatim:true},(err,addresses) => {
          if (err || !addresses?.length) return callback(err || new Error('DNS unavailable'));
          const safe = addresses.filter(a => !blocked.check(a.address,a.family === 6 ? 'ipv6' : 'ipv4'));
          if (!safe.length || safe.length !== addresses.length) return callback(new Error('blocked network address'));
          if (options.all) return callback(null,safe);
          callback(null,safe[0].address,safe[0].family);
        });
      }
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        clearTimeout(timer);
        res.resume();
        const next = publicUrl(res.headers.location,url);
        return fetchPage(next,{method:'GET',limit,timeout},depth+1).then(x=>finish(null,x),finish);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return finish(new Error(`HTTP ${res.statusCode}`)); }
      let size=0; const chunks=[];
      res.on('data',chunk => { if(done)return; const keep=chunk.subarray(0,Math.max(0,limit-size));chunks.push(keep);size+=keep.length;if(size>=limit){finish(null,{url,html:Buffer.concat(chunks).toString('utf8')});res.destroy()} });
      res.on('end',()=>finish(null,{url,html:Buffer.concat(chunks).toString('utf8')}));
      res.on('error',e=>finish(e));
    });
    timer=setTimeout(()=>req.destroy(new Error('request deadline')),timeout);
    req.setTimeout(timeout,()=>req.destroy(new Error('request timeout')));
    req.on('error',e=>finish(e));
    if(body)req.write(body);
    req.end();
  });
}

function attribute(tag,name) {
  const match=tag.match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i'));
  return (match?.[1]||match?.[2]||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
}

export function extractArticlePhoto(html, pageUrl) {
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
    const name=(attribute(tag,'property')||attribute(tag,'name')).toLowerCase();
    if(!['og:image','og:image:url','twitter:image','twitter:image:src'].includes(name))continue;
    const image=attribute(tag,'content');
    if(image && !/(?:logo|favicon|placeholder|default[-_]?image|avatar)/i.test(image)) {
      const url=publicUrl(image,pageUrl);if(url)return url;
    }
  }
  if(new URL(pageUrl).hostname==='www.agenziagiornalisticaopinione.it'){
    for(const tag of html.match(/<img\b[^>]*>/gi)||[]){
      if(!/thumbnail-single-image/i.test(tag))continue;
      const image=attribute(tag,'data-src')||attribute(tag,'src');
      if(!image || /(?:logo|banner|avatar|icon)/i.test(image))continue;
      const url=publicUrl(image,pageUrl);if(url)return url;
    }
  }
  for(const script of html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)||[]){
    try{
      const value=JSON.parse(script.replace(/^[\s\S]*?>/,'').replace(/<\/script>$/i,''));
      const nodes=Array.isArray(value)?value:[value,...(value['@graph']||[])];
      for(const node of nodes){
        if(![node?.['@type']].flat().some(type=>/^(?:NewsArticle|Article|VideoObject|BlogPosting|ReportageNewsArticle|LiveBlogPosting)$/.test(type)))continue;
        const candidate=[node.image,node.thumbnailUrl].flat().find(Boolean);
        const image=publicUrl(typeof candidate==='object'?candidate.url:candidate,pageUrl);
        if(image&&!/(?:favicon|placeholder|avatar|\/logo[._/-])/i.test(image))return image;
      }
    }catch{}
  }
  return '';
}

async function resolveGoogle(html) {
  const id=html.match(/data-n-a-id="([^"]+)"/)?.[1],sig=html.match(/data-n-a-sg="([^"]+)"/)?.[1],ts=html.match(/data-n-a-ts="(\d+)"/)?.[1];
  if(!id||!sig||!ts)throw new Error('Google article parameters missing');
  const config=[['X','X',['X','X'],null,null,1,1,'US:en',null,1,null,null,null,null,null,0,1],'X','X',1,[1,1,1],1,1,null,0,0,null,0];
  const inner=JSON.stringify(['garturlreq',config,id,Number(ts),sig]);
  const body=new URLSearchParams({'f.req':JSON.stringify([[['Fbv4je',inner]]])}).toString();
  const result=await fetchPage('https://news.google.com/_/DotsSplashUi/data/batchexecute',{method:'POST',body,limit:100000});
  const row=result.html.split('\n').find(line=>line.startsWith('[["wrb.fr"'));
  const payload=row&&JSON.parse(row)?.[0]?.[2];
  const url=payload&&publicUrl(JSON.parse(payload)?.[1]);
  if(!url)throw new Error('Google article destination missing');
  return url;
}

function favicon(value) {
  const url=publicUrl(value);
  if(!url)return '';
  const host=new URL(url).hostname;
  if(host==='news.google.com')return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

export function extractArticlePublication(html, now = Date.now()) {
  const candidates=[];
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
    const name=(attribute(tag,'property')||attribute(tag,'name')||attribute(tag,'itemprop')).toLowerCase();
    if(['article:published_time','datepublished','pubdate','publishdate','parsely-pub-date'].includes(name)) candidates.push(attribute(tag,'content'));
  }
  for(const tag of html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)||[]){
    try {
      const parsed=JSON.parse(tag.replace(/^[\s\S]*?>/,'').replace(/<\/script>$/i,''));
      const nodes=Array.isArray(parsed)?parsed:[parsed,...(parsed['@graph']||[])];
      for(const node of nodes){
        const types=[node?.['@type']].flat();
        if(types.some(type=>/^(?:NewsArticle|Article|BlogPosting|ReportageNewsArticle|LiveBlogPosting)$/.test(type))) candidates.push(node.datePublished);
      }
    }catch{}
  }
  // Modification dates are deliberately excluded: edits do not republish a story.
  for(const value of candidates){
    if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value))continue;
    const time=Date.parse(value);
    if(Number.isFinite(time)&&time>0&&time<=now+10*60000)return new Date(time).toISOString();
  }
  return '';
}

function applyPublication(article,pubDate,pageUrl){
  const primaryLink=article.originalURL||article.link;
  return {...article,pubDate,originalPubDate:pubDate,dateSource:'original',originalURL:pageUrl,
    publicationVerifiedKey:article.publicationVerifiedKey||primaryLink,
    sources:(article.sources||[]).map(source=>source.source===article.source||source.link===primaryLink
      ? {...source,pubDate,originalPubDate:pubDate,dateSource:'original',originalURL:pageUrl}:source)};
}

export async function enrichArticle(article, {loadPage=fetchPage}={}) {
  const sources=Array.isArray(article.sources)?article.sources:[];
  const candidates=[article.originalURL||article.link].filter(Boolean);
  const homepage=sources.find(s=>s.source===article.source)?.sourceHomepage || article.sourceHomepage || '';
  let result={...article,logoUrl:article.logoUrl||favicon(homepage)||favicon(candidates[0])};
  if(article.image && article.dateSource==='original') return result;
  for(const candidate of candidates.slice(0,2)){
    try{
      let page=await loadPage(candidate);
      if(new URL(page.url).hostname==='news.google.com'){
        const original=await resolveGoogle(page.html);
        result.logoUrl=result.logoUrl||favicon(original);
        page=await loadPage(original);
      }
      const pubDate=extractArticlePublication(page.html);
      if(pubDate)result=applyPublication(result,pubDate,page.url);
      const image=article.image||extractArticlePhoto(page.html,page.url);
      result={...result,image,imageVerifiedKey:result.originalURL||result.link,logoUrl:result.logoUrl||favicon(page.url)};
      return result;
    }catch{}
  }
  return result;
}

export async function enrichFeed(feed,previous,{deadlineMs=45000,concurrency=12,loadPage=fetchPage}={}) {
  const cache=new Map();
  for(const article of previous?.news||[]) for(const key of [article.link,article.originalURL,article.publicationVerifiedKey].filter(Boolean)) cache.set(key,article);
  const deadline=Date.now()+deadlineMs;
  const output=feed.news.map(a=>{
    const old=cache.get(a.originalURL||a.link)||cache.get(a.link);
    if(old?.dateSource==='original' && old.originalPubDate && old.publicationVerifiedKey){
      a=applyPublication({...a,publicationVerifiedKey:old.publicationVerifiedKey},old.originalPubDate,old.originalURL);
    }
    const homepage=a.sources?.find(s=>s.source===a.source)?.sourceHomepage||a.sourceHomepage||'';
    const key=a.originalURL||a.link;
    const cachedImage=old?.imageVerifiedKey===key?old.image:'';
    return {...a,image:a.image||cachedImage||'',imageVerifiedKey:a.image?undefined:(cachedImage?key:undefined),logoUrl:a.logoUrl||old?.logoUrl||favicon(homepage)||favicon(a.originalURL||a.link)||''};
  });
  // Recover photos before spending the deadline on dates of already illustrated stories.
  const queue=output.map((article,index)=>({article,index}))
    .filter(({article})=>!article.image||article.dateSource!=='original')
    .sort((a,b)=>Number(Boolean(a.article.image))-Number(Boolean(b.article.image)));
  let index=0;
  async function run(){
    while(index<queue.length && Date.now()<deadline){
      const {index:i}=queue[index++];
      output[i]=await enrichArticle(output[i],{loadPage});
    }
  }
  await Promise.all(Array.from({length:concurrency},run));
  const news=output.map(article=>normalizeNewsFreshness(article)).filter(Boolean).sort((a,b)=>Date.parse(b.pubDate)-Date.parse(a.pubDate));
  const imageEnrichment={updatedAt:new Date().toISOString(),photos:output.filter(a=>a.image).length,logos:output.filter(a=>!a.image&&a.logoUrl).length,remaining:output.filter(a=>!a.image&&!a.logoUrl).length};
  return {...feed,news,total:news.length,imageEnrichment,freshnessVersion:'event-date-v1',freshnessEnrichment:{verifiedDates:news.filter(a=>a.dateSource==='original').length,excluded:output.length-news.length}};
}

if (process.argv[1] && new URL(import.meta.url).pathname===process.argv[1]) {
  const feed=JSON.parse(await fs.readFile('news.json','utf8'));
  let previous=null;try{previous=JSON.parse(await fs.readFile('.previous-news.json','utf8'))}catch{}
  const enriched=await enrichFeed(feed,previous);
  await fs.writeFile('news.json',JSON.stringify(enriched,null,2)+'\n');
  console.log(JSON.stringify(enriched.imageEnrichment));
}


