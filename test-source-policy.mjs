import test from "node:test";
import assert from "node:assert/strict";

import {
  isBlockedSource,
  isLowPrioritySource,
  sanitizeFeedArticle
} from "./source-policy.mjs";

const article = (source, sources = [{ source, link: `https://example.com/${encodeURIComponent(source)}` }]) => ({
  title: "Notizia di prova",
  source,
  link: sources[0]?.link || "https://example.com/notizia",
  pubDate: "2026-08-26T17:00:00.000Z",
  categories: ["Cronaca"],
  sources
});

test("esclude tutte le 23 fonti richieste", () => {
  const blocked = [
    "Zazoom Social News", "Virgilio", "Virgilio Sport", "Blasting News",
    "agenziagiornalisticaopinione.it", "blog.ilgiornale.it", "Il Blog di Corigliano Calabro",
    "Tribuna.com", "Juventus News 24", "SpazioJ", "Tifo Juventus", "Bianconera News",
    "Cronachedi", "TuttoFrosinone.com", "vetrina tv", "primanotizia24.it", "CanaleSicilia",
    "italianotizie.online", "Radio Senise Centrale", "GiornaleSM", "Buonasera24",
    "musicletter", "Ticino Notizie"
  ];
  assert.equal(blocked.length, 23);
  for (const source of blocked) {
    assert.equal(isBlockedSource(source), true, source);
    assert.equal(sanitizeFeedArticle(article(source)), null, source);
  }
});

test("mantiene il Giornale ed esclude soltanto il relativo blog", () => {
  assert.equal(isBlockedSource("il Giornale"), false);
  assert.ok(sanitizeFeedArticle(article("il Giornale")));
  assert.equal(isBlockedSource("blog.ilgiornale.it"), true);
});

test("le sei fonti indicate restano ma cedono la fonte primaria", () => {
  const low = ["IlSussidiario.net", "Affaritaliani", "The Social Post", "Lo Spiffero", "L’Identità", "Il Giornale d’Italia"];
  for (const source of low) assert.equal(isLowPrioritySource(source), true, source);

  const cleaned = sanitizeFeedArticle(article("The Social Post", [
    { source: "The Social Post", link: "https://thesocialpost.it/a" },
    { source: "ANSA", link: "https://ansa.it/a" }
  ]));
  assert.equal(cleaned.source, "ANSA");
  assert.deepEqual(cleaned.sources.map(item => item.source), ["ANSA", "The Social Post"]);
});
