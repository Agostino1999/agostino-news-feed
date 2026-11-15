import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isOffTopicEditorialContent } from '../news-relevance.mjs';
import { selectEditorialNews } from '../scripts/editorial-selection.mjs';

const now = Date.parse('2026-11-15T18:00:00Z');
const article = (title, extra = {}) => ({ title, source: 'Corriere della Sera',
  category: 'Cronaca', categories: ['Cronaca'], link: 'https://example.com/' + encodeURIComponent(title),
  pubDate: new Date(now - 60000).toISOString(), ...extra });
const excluded = [
  'Riconoscere le emozioni dei nostri figli',
  'Come aiutare i bambini a gestire le emozioni',
  'Genitorialità e autostima: i consigli degli esperti',
  'Quando la prevenzione maschile salva la vita, i controlli da fare dopo i 50 anni',
  'Dieta e benessere: i consigli per dormire meglio',
  'Ballando con le Stelle, scintille Mariotto-D’Urso: “Delusa e ferita”',
  '«The Voice senior», sono i coach che imparano dai concorrenti',
  'Il ricettario delle meraviglie: il sogno di Camilla diventa realtà',
  'Claudia Schiffer, debutto in società per la figlia',
  'L’oroscopo di lunedì: Leone onnipotente',
  'Treviso d’Autore, seconda giornata di incontri',
  'Taormina Food Expo chiude con migliaia di visitatori',
  'Milano Music Week, i grandi artisti dal centro alle periferie',
  'Corrado Formigli a Napoli per presentare il suo nuovo libro',
  'Motori Magazine - 15/11/2026 · Video',
  'Raisport Hd : Programmi TV e Palinsesto',
  'Italia 1 : Programmi TV e Palinsesto',
  'Sky Atlantic : Programmi TV e Palinsesto',
  'Stasera in TV lunedì 16 novembre 2026, cosa vedere, guida tv',
  'Guida TV - Quotidiano Nazionale',
  'Rai 1: Programmi TV e Palinsesto, La guerra dei mondi',
  'Film stasera: La legge dei più forti'
];
const retained = [
  'Salvini: nuove norme per i cani sugli aerei',
  'Giorgetti presenta la proposta per la manovra',
  'Calderoli interviene sulle autonomie',
  'Valditara: educazione emotiva nelle scuole',
  'Alessandra Locatelli: nuovi interventi per le famiglie',
  'Nuova sede della Lega, incontro con i cittadini',
  'Treviso, ladri speronano auto: donna incinta partorisce d’urgenza',
  'Milano, omicidio del 92enne: due fermati',
  'Famiglia rifiuta l’alloggio destinato ai migranti',
  'Jessica chiede accesso alle cure: farmaco salvavita per tutti i pazienti',
  'Bimbo palestinese salvato al Meyer: riuscito l’intervento',
  'Poliziotto salva la vita a un ragazzo',
  'Raccolta fondi per curare una bambina',
  'Bonus figli: nuove agevolazioni per le famiglie',
  'Codice della strada: nuove regole per gli automobilisti',
  'Anas, riaperta la statale dopo i lavori',
  'Ucraina, negoziati e nuove sanzioni',
  'Aggressione durante il festival: arrestato un uomo',
  'Cantante morto dopo un incidente, il cordoglio dei colleghi',
  'Juventus, le novità prima della prossima partita',
  'Salvini ospite a Porta a Porta: l’intervista',
  'Rai, sciopero dei giornalisti: cambia il palinsesto',
  'Juventus-Torino: dove vedere la partita in TV e streaming'
];

test('rubriche, benessere, gossip ed eventi promozionali restano esclusi anche se recenti', () => {
  for (const title of excluded) assert.equal(isOffTopicEditorialContent(article(title)), true, title);
});

test('politica, cronaca, cure, aiuti, trasporti e Juventus restano ammessi', () => {
  for (const title of retained) assert.equal(isOffTopicEditorialContent(article(title)), false, title);
});

test('categoria, fonte e parole nel sommario non rendono pertinente una rubrica', () => {
  const item = article(excluded[0], { categories: ['Storie umane', 'Lega', 'Governo'],
    summary: 'Con il ministro Salvini. Polizia, arresti e un nuovo decreto del governo.' });
  assert.equal(isOffTopicEditorialContent(item), true);
  assert.equal(selectEditorialNews([item], { now }).length, 0);
});

test('le guide TV sono escluse anche da URL e quando contengono parole riservate alle notizie', () => {
  const item = article('La legge dei più forti', {originalURL:'https://guidatv.quotidiano.net/rai-1/'});
  assert.equal(isOffTopicEditorialContent(item),true);
  assert.equal(selectEditorialNews([item],{now}).length,0);
  assert.equal(isOffTopicEditorialContent(article('Rai Sport HD',
    {link:'https://example.com/programmi-tv/raisport.html'})),true);
});

test('la sezione spettacoli esclude un contenuto generico ma conserva la cronaca reale', () => {
  const link = 'https://www.corriere.it/spettacoli/notizia.shtml';
  assert.equal(isOffTopicEditorialContent(article('Una serata con i protagonisti della televisione', {link})), true);
  assert.equal(isOffTopicEditorialContent(article('Aggressione in studio: arrestato un uomo', {link})), false);
});

test('selezione prima del limite: nessuno spazio sprecato e ordine cronologico preservato', () => {
  const input = [...excluded.map(title => article(title)), ...retained.map((title, i) => article(title,
    {pubDate: new Date(now - (i + 2) * 60000).toISOString()}))];
  const selected = selectEditorialNews(input, {now, limit: 100});
  assert.ok(!selected.some(item => excluded.includes(item.title)));
  for (const title of retained) assert.ok(selected.some(item => item.title === title), title);
  assert.ok(selected.every((item, i) => !i || Date.parse(selected[i - 1].pubDate) >= Date.parse(item.pubDate)));
});

test('il controllo finale elimina anche contenuti reintrodotti dagli arricchimenti', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'news-relevance-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  fs.mkdirSync(path.join(dir, 'scripts'));
  for (const file of ['news-relevance.mjs', 'scripts/cluster-news.mjs', 'scripts/story-clusters.mjs']) {
    fs.copyFileSync(new URL('../' + file, import.meta.url), path.join(dir, file));
  }
  fs.writeFileSync(path.join(dir, 'news.json'), JSON.stringify({success:true,
    news:[article(excluded[0]), article(retained[0])]}));
  execFileSync(process.execPath, [path.join(dir, 'scripts/cluster-news.mjs')]);
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'news.json')));
  assert.equal(data.total, 1);
  assert.equal(data.news[0].title, retained[0]);
  assert.equal(data.editorialRelevance.excluded, 1);
});
