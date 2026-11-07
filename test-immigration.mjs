import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const offTopic = [
  ["Bufera sulla nomina del leghista Altieri all'Anac. Il confronto con Meloni e in serata il passo indietro", "Il dialogo con i vicepremier. «Nessuna irregolarità»"],
  ["10 ore su una barella: il Pronto soccorso cambi l'accoglienza dei disabili", ""],
  ["Ex Ilva, i sindacati: nessuna intesa sulla cassa integrazione", ""],
  ["Irregolarità negli appalti: aperta un'inchiesta", ""],
  ["Fabbrica clandestina di sigarette scoperta dalla Finanza", ""],
  ["Un caloroso benvenuto: l'accoglienza dei tifosi", ""],
  ["Cittadinanza onoraria al campione olimpico", ""],
  ["Gli orari irregolari dei treni", ""],
  ["Nuovo centro di integrazione dei dati", "Migranti, nuovo piano per i rimpatri"]
];
const onTopic = [
  "Sorpreso a Parma in un capannone clandestino: arrestato e rimpatriato in Moldavia un 29enne irregolare",
  "Migranti, cento arrivi a Lampedusa: soccorsi donne e bambini",
  "Espulsi N.4 stranieri pericolosi.",
  "Sicurezza nazionale: accordi per rimpatriare i criminali stranieri",
  "Famiglia di migranti rifiuta la casa offerta dal Comune",
  "Cpr, bocciata la mozione del Pd",
  "Riforma della cittadinanza: confronto sullo ius scholae",
  "Accoglienza dei rifugiati: nuovi fondi",
  "Nuove regole per i permessi di soggiorno",
  "Ong, soccorsi nel Mediterraneo",
  "Centro di accoglienza, il Comune prepara il progetto"
];

test("il generatore usa lo stesso riconoscimento dei temi sui titoli",()=>{
  const source=fs.readFileSync(new URL("./scripts/generate-news.mjs",import.meta.url),"utf8");
  const start=source.indexOf("function hasImmigrationContext(");
  const end=source.indexOf("\nfunction finalClassify(",start);
  const context=vm.createContext({});
  vm.runInContext(source.slice(start,end),context);
  for(const [title] of offTopic)assert.equal(context.hasImmigrationContext(title.toLowerCase()),false,title);
  for(const title of onTopic)assert.equal(context.hasImmigrationContext(title.toLowerCase()),true,title);
  assert.match(source,/const immigration = hasImmigrationContext\(normalize\(article.title \|\| ""\)\);/);
});
