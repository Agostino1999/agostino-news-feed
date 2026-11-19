import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../news-intelligence.js';
const api=globalThis.NewsIntelligence;
const now=Date.parse('2026-11-19T16:00:00Z'),HOUR=3600000;
const article=(title,extra={})=>({title,summary:'',source:'ANSA',pubDate:new Date(now-600000).toISOString(),link:'https://ansa.it/'+encodeURIComponent(title),categories:['Cronaca'],...extra});
const cases=[
  ['De Bruyne, il Napoli fissa il prezzo, ma difficilmente varrà anche per la Serie A',['Calciomercato'],['Juventus'],{source:'Tutto Juve',categories:['Juventus']}],
  ['Juve, accordo per il nuovo attaccante',['Juventus','Calciomercato'],[]],
  ['Napoli, presentato il nuovo attaccante',['Sport'],['Juventus'],{summary:'Leggi anche: Juventus, arriva il nuovo attaccante',source:'Tutto Juve'}],
  ['Juventus, parla il presidente',['Juventus'],['Politica']],
  ['Lega Serie A, approvato il calendario',['Sport'],['Lega']],
  ['La Lega deposita un emendamento in Parlamento',['Lega','Politica'],[]],
  ['Salvini: nuovi investimenti per le ferrovie',['Trasporti','Lega','Governo'],[]],
  ['Valditara annuncia assunzioni per gli organici scolastici',['Lega','Governo','Politica'],[]],
  ['Manuel Locatelli, centrocampista della Juventus',['Juventus','Sport'],['Lega']],
  ['Alessandra Locatelli presenta il progetto per la disabilità',['Lega','Governo'],[]],
  ['Ospedale, migliora l’accoglienza dei pazienti',[],['Immigrazione','Crimini & immigrazione'],{categories:['Immigrazione']}],
  ['Irregolarità negli appalti: aperta un’inchiesta',[],['Immigrazione'],{categories:['Immigrazione']}],
  ['Migranti, cento arrivi a Lampedusa',['Immigrazione'],[]],
  ['Migrante arrestato per rapina',['Immigrazione','Crimini & immigrazione','Sicurezza'],[]],
  ['Poliziotto salva un migrante in mare',['Immigrazione'],['Crimini & immigrazione']],
  ['Il ministro russo presenta il piano del governo russo',['Esteri'],['Governo']],
  ['Europa League, i risultati delle partite',['Sport'],['Europa']],
  ['Commissione europea, approvato il nuovo piano',['Europa'],[]],
  ['Putin furioso per gli attacchi al ponte in Crimea',['Esteri'],['Trasporti']],
  ['Putin apre agli europei: li invita a Mosca a dire cosa portano al tavolo',['Esteri'],['Trasporti']],
  ['Perché il centrodestra si sfilaccia sui libri scolastici digitali',['Politica'],[]],
  ['Tunisino arrestato per rapina',['Crimini & immigrazione','Sicurezza'],[]],
  ['Il corpo del bambino disperso è stato ritrovato',[],['Storie umane'],{categories:['Storie umane']}]
];
for(const [title,yes,no,extra]of cases)test('Categorie: '+title,()=>{
  const result=api.classifyArticle(article(title,extra));
  for(const category of yes)assert.ok(result.categories.includes(category),'missing '+category);
  for(const category of no)assert.ok(!result.categories.includes(category),'unexpected '+category);
  assert.deepEqual(api.classifyArticle(result),result,'classification must be idempotent');
});
const sourceNews=(title,source,index=0)=>article(title,{source,link:'https://example.com/'+source+'/'+index});
test('quota 64 and retirement at 64 form one topic with distinct publishers',()=>{
  const news=[sourceNews('Salvini insiste su quota 64','ANSA'),sourceNews('Pensioni a 64 anni, ecco la proposta','Sky TG24')];
  const result=api.buildTopicTrends(news,{now});
  assert.equal(result.length,1);assert.equal(result[0].label,'Pensioni a 64 anni');assert.equal(result[0].sourceCount,2);
});
test('same politician on different issues stays in separate topics',()=>{
  const news=[sourceNews('Salvini insiste su quota 64','ANSA'),sourceNews('Pensioni a 64 anni, la proposta di Salvini','Sky TG24'),
    sourceNews('Salvini nella lista di proscrizione di Kiev','ANSA',1),sourceNews('Ucraina, Salvini schedato nella lista anti-Kiev','Il Giornale')];
  const result=api.buildTopicTrends(news,{now});
  assert.equal(result.length,2);assert.ok(result.every(t=>t.articles.length===2));
});
test('one publisher repeating a story does not create a trend',()=>{
  const news=[sourceNews('Quota 64, Salvini insiste','ANSA'),sourceNews('Quota 64, nuova proposta','ansa.it')];
  assert.equal(api.buildTopicTrends(news,{now}).length,0);
});
test('clustered sources contribute once each, including publisher aliases',()=>{
  const a=article('Pensioni a 64 anni',{source:'Corriere della Sera',sources:[{source:'Corriere.it'},{source:'Sky TG24'},{source:'Sky TG24'}]});
  assert.equal(api.buildTopicTrends([a],{now})[0].sourceCount,2);
});
test('generic words and a name alone never become trends',()=>{
  const news=[sourceNews('Forza, casa e Salvini','ANSA'),sourceNews('Salvini e la casa, forza!','Sky TG24')];
  assert.equal(api.buildTopicTrends(news,{now}).length,0);
});
test('an unseen event can emerge without adding a named topic rule',()=>{
  const news=[sourceNews('Voghera, arrestato uomo con stupefacente nascosto in casa','ANSA'),sourceNews('Voghera, uomo arrestato: stupefacente nascosto in casa','Il Giorno')];
  const result=api.buildTopicTrends(news,{now});assert.equal(result.length,1);assert.ok(result[0].label.includes('Voghera'));
});
test('future and expired articles do not count as current trends',()=>{
  const news=[sourceNews('Quota 64, proposta','ANSA'),article('Quota 64, annuncio',{source:'Sky TG24',pubDate:new Date(now-4*HOUR).toISOString()}),article('Quota 64, riforma',{source:'Il Giornale',pubDate:new Date(now+HOUR).toISOString()})];
  assert.equal(api.buildTopicTrends(news,{now}).length,0);
});
test('old alternative sources do not count as new coverage',()=>{
  const a=article('Quota 64, proposta',{sources:[{source:'Sky TG24',pubDate:new Date(now-4*HOUR).toISOString()}]});
  assert.equal(api.buildTopicTrends([a],{now}).length,0);
});
test('cold start never claims growth',()=>{
  const news=['ANSA','Sky TG24','Il Giornale'].map(s=>sourceNews('Quota 64, proposta',s));
  const history=api.collectHistory(news,{},now),t=api.buildTopicTrends(news,{history,now})[0];
  assert.equal(t.growing,false);assert.equal(t.comparisonReady,false);
});
test('growth compares equal three-hour windows with enough observed history',()=>{
  const news=['ANSA','Sky TG24','Il Giornale'].map(s=>sourceNews('Quota 64, proposta',s));
  const history={observedSince:now-7*HOUR,collectedAt:now,rows:[{topic:'pensioni-quota64',publisher:'ansa',time:now-4*HOUR}]};
  const t=api.buildTopicTrends(news,{history,now})[0];assert.equal(t.growing,true);assert.equal(t.previousSourceCount,1);
});
test('a collection gap resets comparison coverage',()=>{
  const history=api.collectHistory([],{observedSince:now-9*HOUR,collectedAt:now-2*HOUR,rows:[]},now);
  assert.equal(history.observedSince,now);
});
test('repeated collection preserves first publication and bounds history',()=>{
  const a=article('Quota 64, proposta'),first=api.collectHistory([a],{},now);
  const next=api.collectHistory([{...a,pubDate:new Date(now+60000).toISOString()}],first,now+60000);
  assert.equal(next.rows.length,1);assert.equal(next.rows[0].time,Date.parse(a.pubDate));
  const expired={key:'old',time:now-13*HOUR,topic:'pensioni-quota64'};
  assert.ok(!api.collectHistory([],{...next,rows:[expired]},now).rows.length);
});
test('emerging event identity survives a slightly changed headline',()=>{
  const first=api.collectHistory([sourceNews('Voghera, arrestato uomo con stupefacente nascosto in casa','ANSA')],{},now);
  const next=api.collectHistory([sourceNews('Voghera, uomo arrestato: stupefacente nascosto in casa','Il Giorno')],first,now+60000);
  assert.equal(new Set(next.rows.map(r=>r.topic)).size,1);
});
