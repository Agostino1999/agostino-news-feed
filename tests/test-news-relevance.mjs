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
  'Film stasera: La legge dei più forti',
  "L'analisi/ Scongiurare una nuova Yalta",
  "L'editoriale/ L’orologio della Storia e l’Europa",
  'Opinioni | Un’altra AI è possibile',
  'L’opinione/ La guerra e il nuovo governo',
  'Rubriche | Uno sguardo sulla politica',
  'Il commento: Salvini, la manovra e la guerra',
  'L’editoriale di Mario Rossi: il nuovo decreto'
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
  'Juventus-Torino: dove vedere la partita in TV e streaming',
  'Le analisi del sangue salvano un bambino',
  'Salvini commenta il nuovo decreto sulla sicurezza',
  'Il commento di Salvini dopo il voto in Parlamento',
  'Analisi del DNA, arrestato il sospetto',
  'Editoriale Domani, sciopero dei giornalisti'
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

test('le sezioni opinioni ed editoriali escludono anche i titoli generici o con ministri e decreti', () => {
  for (const [title,originalURL] of [
    ['La proposta indecente','https://www.corriere.it/opinioni/26_novembre_15/notizia.shtml'],
    ['Salvini, nuove regole e prospettive','https://www.ilmessaggero.it/editoriali/politica/notizia.html'],
    ['Un titolo generico','https://www.example.com/rubriche/il-punto/notizia']
  ]) {
    const item=article(title,{originalURL,categories:['Politica','Lega'],summary:'Salvini presenta un decreto'});
    assert.equal(isOffTopicEditorialContent(item),true,title);
    assert.equal(selectEditorialNews([item],{now}).length,0,title);
  }
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
  for (const file of ['news-relevance.mjs', 'source-policy.mjs', 'scripts/cluster-news.mjs', 'scripts/story-clusters.mjs']) {
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

const actualNoise = [
  'Quando il cibo smette di essere soltanto cibo: cinque secoli di arte raccontano ciò che mettiamo a tavola',
  'Christmas Parade, parata di Natale al centro di Roma',
  'Nella Roma dei Barberini: Bernini, Rubens e Gentileschi in mostra a Cuneo',
  'Al Pac la rivoluzione tessile di Sheila Hicks che ha conquistato i musei',
  'WIN&, mostra della cultura del vino italiano',
  'Remira Market, il mercatino vintage a ingresso gratuito che conquista Milano',
  'William e Kate in India, la principessa torna in missione all’estero: sfida a cricket con Tendulkar',
  'Fiera di Codogno, sono 235 edizioni. Sempre fra tradizione e futuro',
  'La Burrata pugliese è il formaggio italiano del 2026',
  'Il segreto del successo?: Incontro che rafforza il senso di comunità',
  'Prezzo fissato a cinque euro. In prevendita si risparmia',
  'Mauro Roca: profilo e statistiche del giocatore',
  'Notizie Correlate - Sky Sport',
  'Statistiche Fantacampionato: i portieri con più clean sheet in Serie A',
  'Regione lombardia: Tutte le ultime notizie in tempo reale su Regione lombardia - Pagina 220',
  'Gubbio, Salvini sempre più vicino: l’ex Frosinone verso la nomina a ds',
  'Gianluca Veneziani',
  'Nell’interesse generale',
  'Xiaomi presenta il nuovo telefono',
  'Contenuti e creatività: cinque idee per un weekend',
  'I migliori libri da leggere in inverno',
  'Il nuovo processore per i computer',
  'Moto acrobatiche trenino e i sogni verticali di Angelika'
];
const actualWorkNews = [
  'Roma: 27 arresti e sequestrata oltre una tonnellata di stupefacenti',
  'Schlein sfida Salvini: se andremo al governo, il Ponte sullo Stretto sarà cancellato',
  'Migranti, Salvini: stop a sussidi con Isee o immigrati fanno incetta',
  'Elezioni suppletive alla Camera: crolla l’affluenza, Chieti sopra la media',
  'Piano Casa sull’emergenza affitti. In diciotto mesi pronti 130 alloggi',
  'Scuole occupate a Milano: le ragioni della protesta',
  'Il caos nei cieli Usa causato dal malfunzionamento di un router',
  'Il portierino fair play ospite dell’Italia. Edoardo in campo insieme a Donnarumma',
  'Bombe d’acqua nel Salernitano, frane e alberi caduti: salvata una famiglia con bambini',
  'Spalletti riparte alla Continassa: domenica arriva il Venezia, due recuperi probabili',
  'Milan, assalto a Inacio: Amorim lo aspetta per gennaio',
  'Sinner in finale al torneo di tennis',
  'Formula 1, Antonelli vince il Gran Premio',
  'Le analisi del sangue salvano un bambino',
  'Minorenne partorisce da sola in bagno, la neonata trovata senza vita',
  'Intercettato un narcosub dalla Marina francese: il video dell’operazione'
];

test('i contenuti estranei osservati nel feed del 16 novembre sono respinti anche con categorie false e sommari politici', () => {
  for (const title of actualNoise) {
    const item=article(title,{categories:['Politica','Lega','Storie umane','Sport'],summary:'Salvini, governo, arresti e migranti'});
    assert.equal(isOffTopicEditorialContent(item),true,title);
    assert.equal(selectEditorialNews([item],{now,reportedLinks:new Set([item.link])}).length,0,title);
  }
});

test('le notizie reali utili restano ammesse senza bisogno di categorie o testo aggiuntivo', () => {
  for (const title of actualWorkNews) assert.equal(isOffTopicEditorialContent(article(title,{categories:[],summary:''})),false,title);
});

test('il limite non viene riempito con articoli privi di pertinenza', () => {
  const input=[...actualNoise,...actualWorkNews].map(title=>article(title));
  const selected=selectEditorialNews(input,{now,limit:300});
  assert.equal(selected.length,actualWorkNews.length);
  assert.ok(selected.every(item=>actualWorkNews.includes(item.title)));
});

test('il controllo dopo gli arricchimenti applica anche le esclusioni delle fonti', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'news-final-relevance-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.mkdirSync(path.join(dir,'scripts'));
  for(const file of ['news-relevance.mjs','source-policy.mjs','scripts/cluster-news.mjs','scripts/story-clusters.mjs'])
    fs.copyFileSync(new URL('../'+file,import.meta.url),path.join(dir,file));
  const good=article(actualWorkNews[0]);
  const blocked=article('Migranti: nuovi sbarchi a Lampedusa',{source:'Cronachedi',link:'https://cronachedi.it/notizia'});
  fs.writeFileSync(path.join(dir,'news.json'),JSON.stringify({success:true,news:[good,blocked,...actualNoise.map(title=>article(title))]}));
  execFileSync(process.execPath,[path.join(dir,'scripts/cluster-news.mjs')]);
  const data=JSON.parse(fs.readFileSync(path.join(dir,'news.json')));
  assert.equal(data.total,1);
  assert.equal(data.news[0].title,good.title);
  assert.equal(data.editorialRelevance.version,'focused-news-v2');
});
