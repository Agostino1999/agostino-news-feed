import test from "node:test";
import assert from "node:assert/strict";

import {
  isBlockedSource,
  isIrrelevantNonJuventusSport,
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

test("esclude tutte le fonti richieste", () => {
  const blocked = [
    "Zazoom Social News", "Virgilio", "Virgilio Sport", "Blasting News",
    "agenziagiornalisticaopinione.it", "blog.ilgiornale.it", "Il Blog di Corigliano Calabro",
    "Tribuna.com", "Juventus News 24", "SpazioJ", "Tifo Juventus", "Bianconera News",
    "Cronachedi", "TuttoFrosinone.com", "vetrina tv", "primanotizia24.it", "CanaleSicilia",
    "italianotizie.online", "Radio Senise Centrale", "GiornaleSM", "Buonasera24",
    "musicletter", "Ticino Notizie", "Calcio Rosanero",
    "Bigodino.it", "AbruzzoNews24", "ArtesTV | Giornale", "Concorsando.it",
    "corrierecomo.it", "Demócrata", "Eventi e News", "Giornalemio.it", "In Prima News",
    "Informat.ro", "lamilano.it", "La Tiburtina", "M Social Magazine", "Megamodo",
    "MondoPrimavera", "Pavia Uno TV", "sport2u.tv", "toscanews.net", "Tuttocampo",
    "VelvetMag.it", "WineNews", "Osservatorio Balcani Caucaso Transeuropa",
    "European Parliament", "federvolley.it", "PPN ADI – Agenzia delle Infrastrutture",
    "APRE – Agenzia per la Promozione della Ricerca Europea", "CORDIS | European Commission"
  ];
  assert.equal(blocked.length, 51);
  for (const source of blocked) {
    assert.equal(isBlockedSource(source), true, source);
    assert.equal(sanitizeFeedArticle(article(source)), null, source);
  }
});

test("mantiene lo sport attendibile e continua a eliminare le fonti bloccate", () => {
  const palermo = { ...article("Calcio Rosanero"), title: "Calciomercato: Blin verso il Cesena" };
  const como = { ...article("Sky Sport"), title: "Como-Ricci, prestito con diritto di riscatto" };
  const kean = { ...article("Calciomercato"), title: "Moise Kean al Como, affare vicino alla chiusura" };
  const mondiale = { ...article("La Provincia Unica Tv"), title: "L'Italia punta al Mondiale: scatta la sfida decisiva!" };
  const legends = { ...article("Open"), title: "Da Zanetti a Cannavaro: le leggende del calcio tornano in campo" };
  const volley = { ...article("Volley News"), title: "Velasco dopo Italia-Francia: una partita straordinaria" };
  const uefa = { ...article("Sky Sport"), title: "Uefa pronta ad azione legale con Infantino e Fifa: le news" };
  const formulaOne = { ...article("Il Giorno"), title: "Formula 1, effetto Kimi Antonelli sul Gran Premio di Monza" };
  const fiorentina = { ...article("chiamarsibomber.com"), title: "Fiorentina, scelto il sostituto di Kean: obiettivo Zirkzee in attacco" };
  const milanVenezia = { ...article("Il Giorno"), title: "Milan-Venezia, Amorim: Leao? A volte meglio separarsi" };
  const crans = { ...article("La Gazzetta del Mezzogiorno"), title: "Crans-Montana: Leo Bove, il calcio nel cuore e le partite con gli amici" };
  const film = { ...article("Il Resto del Carlino"), title: "Italia-Germania, un film sulla partita del 1944" };
  const naplesCrime = { ...article("Corriere delle Alpi"), title: "Giovane turista straniero ferito a bottigliate a Napoli durante rapina" };
  const juve = { ...article("Sky Sport"), title: "Juve, accordo per Kessié" };
  assert.equal(isIrrelevantNonJuventusSport(palermo), true);
  assert.equal(sanitizeFeedArticle(palermo), null);
  for (const kept of [como, kean, mondiale, legends, volley, uefa, formulaOne, fiorentina, milanVenezia]) assert.ok(sanitizeFeedArticle(kept), kept.title);
  assert.ok(sanitizeFeedArticle(crans));
  assert.ok(sanitizeFeedArticle(film));
  assert.ok(sanitizeFeedArticle(naplesCrime));
  assert.ok(sanitizeFeedArticle(juve));
});

test("mantiene il Giornale ed esclude soltanto il relativo blog", () => {
  assert.equal(isBlockedSource("il Giornale"), false);
  assert.ok(sanitizeFeedArticle(article("il Giornale")));
  assert.equal(isBlockedSource("blog.ilgiornale.it"), true);
});

test("le fonti secondarie restano ma cedono la fonte primaria", () => {
  const low = [
    "IlSussidiario.net", "Affaritaliani", "The Social Post", "Lo Spiffero", "L’Identità", "Il Giornale d’Italia",
    "La Discussione", "Agenparl", "Agenda Digitale", "La Nuova Bussola Quotidiana", "la notizia",
    "Giornale La Voce", "Notizie Plus", "NewSicilia", "SiciliaWeb", "RadioRoma.it", "IlFaroOnline",
    "TRIESTE.news", "Verona Oggi", "Polesine24", "Il Meridio", "il Dolomiti", "LaRampa",
    "La Voce di Cesenatico", "Teleromagna", "Gazzetta d’Alba", "Corriere dell’Irpinia",
    "Corriere della Calabria", "BolognaToday", "LivornoToday", "IlPescara", "IlPiacenza"
  ];
  assert.equal(low.length, 32);
  for (const source of low) assert.equal(isLowPrioritySource(source), true, source);

  const cleaned = sanitizeFeedArticle(article("The Social Post", [
    { source: "The Social Post", link: "https://thesocialpost.it/a" },
    { source: "ANSA", link: "https://ansa.it/a" }
  ]));
  assert.equal(cleaned.source, "ANSA");
  assert.deepEqual(cleaned.sources.map(item => item.source), ["ANSA", "The Social Post"]);
});

test("mantiene le cinque fonti indicate e le tre eccezioni sportive", () => {
  const kept = ["Eunews", "Euronews", "Agenparl", "Italpress", "LaPresse"];
  for (const source of kept) {
    assert.equal(isBlockedSource(source), false, source);
    assert.ok(sanitizeFeedArticle(article(source)), source);
  }
  for (const source of ["Corriere dello Sport", "Tuttosport", "Gianluca Di Marzio"]) {
    assert.equal(isBlockedSource(source), false, source);
    assert.ok(sanitizeFeedArticle({
      ...article(source),
      title: "Juventus, incontro per Kessié",
      categories: ["Juventus", "Calciomercato"]
    }), source);
  }
  assert.equal(isLowPrioritySource("Agenparl"), true);
  for (const source of ["Eunews", "Euronews", "Italpress", "LaPresse"]) {
    assert.equal(isLowPrioritySource(source), false, source);
  }
});
