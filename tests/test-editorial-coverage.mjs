import test from "node:test";
import assert from "node:assert/strict";
import { restoreVerifiedDates, selectEditorialNews } from "../scripts/editorial-selection.mjs";

const now = Date.parse("2026-11-10T16:00:00Z");
const article = (id, category, minutes = 10, source = "ANSA") => ({
  id,
  title: category === "Governo" ? `Meloni annuncia il decreto ${id}` : `${category}: aggiornamento ${id}`,
  category,
  categories: [category],
  source,
  link: `https://example.com/${id}`,
  pubDate: new Date(now - minutes * 60000).toISOString(),
  sources: [{ source, link: `https://example.com/${id}` }]
});
const politics = () => Array.from({ length: 350 }, (_, i) => article(`politica-${i}`, "Governo", i));
const juventus = (count = 25) => Array.from({ length: count }, (_, i) => article(`juve-${i}`, "Juventus", i + 1, "Sky Sport"));

test("un feed pieno di politica conserva venti notizie Juventus delle fonti ammesse", () => {
  const selected = selectEditorialNews([...politics(), ...juventus()], { now, limit: 300 });
  assert.equal(selected.length, 300);
  assert.ok(selected.filter(item => item.category === "Juventus").length >= 20);
  assert.equal(new Set(selected.map(item => item.id)).size, selected.length);
  for (let i = 0; i < 20; i++) assert.ok(selected.some(item => item.id === `juve-${i}`));
  assert.ok(selected.every((item, i) => !i || Date.parse(selected[i - 1].pubDate) >= Date.parse(item.pubDate)));
});

test("fonti escluse non consumano lo spazio riservato alle notizie Juve visibili", () => {
  const excluded = Array.from({ length: 30 }, (_, i) => article(`esclusa-${i}`, "Juventus", 0, "JuventusNews24"));
  const selected = selectEditorialNews([...politics(), ...excluded, ...juventus()], { now });
  assert.ok(selected.filter(item => item.category === "Juventus" && item.source === "Sky Sport").length >= 20);
});

test("notizie troppo vecchie o future non entrano nella quota Juventus", () => {
  const old = article("vecchia", "Juventus", 5 * 24 * 60, "Sky Sport");
  const future = article("futura", "Juventus", -20, "Sky Sport");
  const selected = selectEditorialNews([...politics(), old, future, ...juventus(5)], { now });
  assert.equal(selected.filter(item => item.category === "Juventus").length, 5);
  assert.ok(!selected.some(item => item.id === "vecchia" || item.id === "futura"));
});

test("le coperture già previste e il limite complessivo restano rispettati", () => {
  const coverage = [["Storie umane", 12], ["Immigrazione", 10], ["Crimini & immigrazione", 12]];
  const candidates = coverage.flatMap(([category, count]) =>
    Array.from({ length: count }, (_, i) => article(`${category}-${i}`, category))
  );
  const selected = selectEditorialNews([...politics(), ...candidates, ...juventus()], { now });
  assert.equal(selected.length, 300);
  for (const [category, count] of coverage) assert.equal(selected.filter(item => item.category === category).length, count);
  assert.ok(selected.filter(item => item.category === "Juventus").length >= 20);
});

test("i collegamenti segnalati mantengono la precedenza anche con un limite ridotto", () => {
  const reported = article("segnalata", "Cronaca", 60);
  const selected = selectEditorialNews([...politics(), ...juventus(), reported], {
    now, limit: 40, reportedLinks: new Set([reported.link])
  });
  assert.equal(selected.length, 40);
  assert.ok(selected.some(item => item.id === reported.id));
});

test("le notizie principali sulle dimissioni non vengono scartate mentre resta solo il profilo del successore", () => {
  const headlines = [
    ["huang-ansa", "Nvidia: Jensen Huang si è dimesso da ceo, Colette Kress nominata ad interim. Trump candida Cook"],
    ["huang-corriere", "Nvidia, Huang si dimette dopo gli scandali: crollano le azioni, trema il mondo dell'AI"]
  ].map(([id, title]) => ({ ...article(id, "Cronaca", 80), title }));
  const profile = { ...article("profilo-kress", "Cronaca", 120),
    title: "Colette Kress, chi è la nuova ceo di Nvidia dopo le dimissioni di Jensen Huang" };
  const selected = selectEditorialNews([...politics(), ...headlines, profile], { now, limit: 300 });
  for (const headline of headlines) assert.ok(selected.some(item => item.id === headline.id), headline.title);
  assert.equal(selected.length, 300);
});

test("le ultime notizie di cronaca non sono scartate da centinaia di articoli politici vecchi", () => {
  const old = politics().map(item => ({...item, pubDate: new Date(now - 2 * 86400000).toISOString()}));
  const recent = Array.from({length: 60}, (_, i) => article(`ultima-${i}`, "Cronaca", i));
  const selected = selectEditorialNews([...old, ...recent], {now});
  for (const item of recent) assert.ok(selected.some(kept => kept.id === item.id), item.id);
  assert.equal(selected[0].id, "ultima-0");
  assert.equal(selected.length, 300);
});

test("ogni quota tematica conserva gli sviluppi più recenti prima degli articoli di rango maggiore", () => {
  const old = Array.from({length: 30}, (_, i) => ({...article(`vecchia-storia-${i}`, "Storie umane", 1800), title: `Una mamma riceve aiuto per le cure ${i}`}));
  const latest = article("ultima-storia", "Storie umane", 2);
  const selected = selectEditorialNews([...politics(), ...old, latest], {now});
  assert.ok(selected.some(item => item.id === latest.id));
});

test("date originali e cache sono applicate prima del limite e non riciclano vecchi articoli", () => {
  const recycled = article("riciclata", "Lega", 1);
  const old = {...recycled, dateSource: "original", originalPubDate: new Date(now - 10 * 86400000).toISOString(),
    publicationVerifiedKey: recycled.link, originalURL: "https://example.com/riciclata-originale"};
  const latest = article("appena-pubblicata", "Cronaca", 2);
  const before = JSON.stringify([recycled, old]);
  const selected = selectEditorialNews([recycled, latest], {now, limit: 1, previousNews: [old]});
  assert.equal(selected[0].id, latest.id);
  const restored = restoreVerifiedDates([recycled], [old])[0];
  assert.equal(restored.pubDate, old.originalPubDate);
  assert.equal(restored.sources[0].pubDate, old.originalPubDate);
  assert.equal(JSON.stringify([recycled, old]), before);
});

test("notizie future, annunci scaduti e pubblicazioni oltre quattro giorni non occupano posti", () => {
  const future = article("futuro", "Lega", -30);
  const old = article("vecchio", "Lega", 5 * 1440);
  const expired = {...article("scaduto", "Lega"), title: "Confermata l'inaugurazione del 9 novembre"};
  assert.equal(selectEditorialNews([future, old, expired], {now}).length, 0);
});

test("il feed pieno conserva il più recente aggiornamento Salvini e quello della Lega", () => {
  const salvini = {...article("salvini", "Lega", 90), title: "Salvini annuncia nuovi interventi"};
  const lega = {...article("lega", "Lega", 80), title: "Giorgetti presenta la proposta"};
  const selected = selectEditorialNews([...politics(), salvini, lega], {now, limit: 50});
  assert.ok(selected.some(item => item.id === salvini.id));
  assert.ok(selected.some(item => item.id === lega.id));
});

test("una fonte secondaria recente non fa scomparire l'ultimo aggiornamento Salvini ammesso nei riquadri", () => {
  const secondary = {...article("salvini-secondaria", "Lega", 2, "IlSussidiario.net"), title: "Salvini-Zaia: le novità"};
  const national = {...article("salvini-nazionale", "Lega", 240, "ANSA"), title: "Salvini interviene sui bot"};
  const selected = selectEditorialNews([...politics(), secondary, national], {now, limit: 50});
  assert.ok(selected.some(item => item.id === national.id));
});

