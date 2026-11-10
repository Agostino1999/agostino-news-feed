import test from "node:test";
import assert from "node:assert/strict";
import { selectEditorialNews } from "../scripts/editorial-selection.mjs";

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
  assert.equal(selected.filter(item => item.category === "Juventus").length, 20);
  assert.equal(new Set(selected.map(item => item.id)).size, selected.length);
  for (let i = 0; i < 20; i++) assert.ok(selected.some(item => item.id === `juve-${i}`));
  assert.ok(selected.every((item, i) => !i || Date.parse(selected[i - 1].pubDate) >= Date.parse(item.pubDate)));
});

test("fonti escluse non consumano lo spazio riservato alle notizie Juve visibili", () => {
  const excluded = Array.from({ length: 30 }, (_, i) => article(`esclusa-${i}`, "Juventus", 0, "JuventusNews24"));
  const selected = selectEditorialNews([...politics(), ...excluded, ...juventus()], { now });
  assert.equal(selected.filter(item => item.category === "Juventus" && item.source === "Sky Sport").length, 20);
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
  assert.equal(selected.filter(item => item.category === "Juventus").length, 20);
});

test("i collegamenti segnalati mantengono la precedenza anche con un limite ridotto", () => {
  const reported = article("segnalata", "Cronaca", 60);
  const selected = selectEditorialNews([...politics(), ...juventus(), reported], {
    now, limit: 40, reportedLinks: new Set([reported.link])
  });
  assert.equal(selected.length, 40);
  assert.ok(selected.some(item => item.id === reported.id));
});
