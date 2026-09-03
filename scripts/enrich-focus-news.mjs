import fs from "node:fs/promises";

const OUT = "news.json";
const MAX_ITEMS = 300;
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 2;

/*
  Arricchimento mirato per le sezioni che nel feed base possono risultare
  sottorappresentate. Non modifica la logica cronologica: alla fine ordina
  sempre per pubDate decrescente.
*/
const FOCUS_QUERIES = [
  // CRIMINI & IMMIGRAZIONE / FENOMENI GIOVANILI
  ["Crimini & immigrazione", '"baby gang" OR babygang Italia when:2d'],
  ["Crimini & immigrazione", 'maranza OR maranze Italia arrestato aggressione rapina rissa when:2d'],
  ["Crimini & immigrazione", '"italiani di seconda generazione" OR "seconda generazione" OR "seconde generazioni" Italia when:3d'],
  ["Crimini & immigrazione", 'straniero immigrato irregolare arrestato aggressione rapina Italia when:1d'],
  ["Crimini & immigrazione", '(immigrato OR irregolare OR clandestino OR extracomunitario) (arrestato OR rapina OR aggressione OR spaccio OR espulso) (site:ansa.it OR site:repubblica.it OR site:corriere.it OR site:adnkronos.com OR site:agi.it OR site:ilgiornale.it OR site:liberoquotidiano.it) when:4d'],
  ["Crimini & immigrazione", '("baby gang" OR maranza OR borseggiatrice) (arrestato OR aggressione OR rapina OR rissa) (site:ansa.it OR site:repubblica.it OR site:corriere.it OR site:adnkronos.com OR site:agi.it OR site:ilgiornale.it OR site:liberoquotidiano.it) when:4d'],

  // STORIE UMANE — solo esiti positivi da testate nazionali riconoscibili
  ["Storie umane", '("salvato" OR "salvata" OR "fuori pericolo" OR "salva la vita") (site:ansa.it OR site:repubblica.it OR site:corriere.it OR site:adnkronos.com OR site:agi.it OR site:ilgiornale.it OR site:quotidiano.net) when:4d'],
  ["Storie umane", '(cane OR gatto OR delfino OR bambino) (salvato OR adottato OR liberato OR guarito) (site:ansa.it OR site:repubblica.it OR site:corriere.it OR site:quotidiano.net) when:5d'],
  ["Storie umane", '("salvato" OR "salvata" OR "soccorso" OR "ritrovato") (site:napolitoday.it OR site:romatoday.it OR site:milanotoday.it OR site:salernotoday.it OR site:trentotoday.it) when:5d'],
  ["Storie umane", '("solidarietà" OR "raccolta fondi" OR "gesto eroico" OR "lieto fine") Italia when:5d'],

  // EUROPA — soprattutto istituzioni e politica UE
  ["Europa", '"Commissione europea" OR "Parlamento europeo" OR "Consiglio europeo" when:1d'],
  ["Europa", '"Unione Europea" Bruxelles UE politica when:1d'],
  ["Europa", 'Bruxelles europarlamento eurodeputati Europa when:1d'],

  // ESTERI — principali dossier internazionali
  ["Esteri", 'Trump USA esteri politica when:1d'],
  ["Esteri", 'Ucraina Russia guerra when:1d'],
  ["Esteri", 'Israele Gaza Iran Medio Oriente when:1d'],
  ["Esteri", 'Cina Taiwan geopolitica when:1d'],

  // TESTATE PRIORITARIE — copertura generale, mantenendo anche Google News ampio.
  ["Cronaca", "site:ansa.it when:1d"],
  ["Cronaca", "site:repubblica.it when:1d"],
  ["Cronaca", "site:corriere.it when:1d"],
  ["Cronaca", "site:ilgiornale.it when:1d"],
  ["Cronaca", "site:liberoquotidiano.it when:1d"],
  ["Cronaca", "site:iltempo.it when:1d"],
  ["Cronaca", "site:ilgiorno.it when:1d"],
  ["Cronaca", "site:adnkronos.com when:1d"],
  ["Cronaca", "site:agi.it when:1d"],
  ["Cronaca", "site:quotidiano.net when:1d"],
  ["Juventus", "site:sport.sky.it Juventus when:2d"]
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function decodeEntities(s = "") {
  const named = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
    ndash: "–",
    mdash: "—",
    agrave: "à",
    egrave: "è",
    eacute: "é",
    igrave: "ì",
    ograve: "ò",
    ugrave: "ù"
  };

  let out = String(s);

  for (let i = 0; i < 3; i++) {
    const previous = out;
    out = out
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&([A-Za-z]+);/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(named, name) ? named[name] : match
      );
    if (out === previous) break;
  }

  return out;
}

function cleanText(value = "") {
  return decodeEntities(
    String(value)
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function tag(item, name) {
  const match = String(item).match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i")
  );
  return match ? cleanText(match[1]) : "";
}

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPositiveHumanStory(title = "", summary = "") {
  const text = normalize(`${title} ${summary}`);
  const humanSubject = /\b(person|bimb|bambin|ragazz|giovane|uomo|donna|anzian|figli|figlia|madre|padre|famiglia|escursionist|automobilist|pazient|clochard|senza dimora)\w*/.test(text);
  const animalSubject = /\b(cane|cani|cucciol|gatto|gatti|animale|animali|bovino|cavallo|capriolo|delfin|tartarug)\w*/.test(text);
  const positiveOutcome = /\b(salvat|soccors|ritrovat|rintracciat|recuperat|liberat|messo in salvo|fuori pericolo|riabbracci|sopravviss|adottat|gesto eroico|lieto fine|torna a casa|torna indietro|si risveglia)\w*/.test(text);
  const solidarity = /\b(solidariet|raccolta fondi|benefic|volontari|comunita si mobilita)\w*/.test(text)
    && /\b(aiut|don|regal|offr|famiglia|bambin|anzian|malat|difficolta)\w*/.test(text);
  const fatal = /\b(mort|muor|decedut|cadavere|uccis|omicid|strage|si suicida|si toglie la vita)\w*/.test(text);
  return (((humanSubject || animalSubject) && positiveOutcome) || solidarity) && !fatal;
}

const STOPWORDS = new Set(
  "della delle degli dello che con per una uno nel nella nelle alla alle dagli dalle sono come dopo prima tra fra sul sulla sulle dai dal del dei il lo la i gli le un di da a e o in su al ai si ha hanno essere contro piu non news italia italiano italiana italiani italiane".split(" ")
);

function titleTokens(title = "") {
  return new Set(
    normalize(title)
      .split(" ")
      .filter(token => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token))
  );
}

function intersectionSize(a, b) {
  let count = 0;
  for (const token of a) if (b.has(token)) count++;
  return count;
}

function sameStory(a, b) {
  const na = normalize(a?.title || "");
  const nb = normalize(b?.title || "");
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ta = new Date(a?.pubDate).getTime();
  const tb = new Date(b?.pubDate).getTime();
  if (Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) > 36 * 3600000) {
    return false;
  }

  const A = titleTokens(a?.title || "");
  const B = titleTokens(b?.title || "");
  if (!A.size || !B.size) return false;

  const common = intersectionSize(A, B);
  const containment = common / Math.min(A.size, B.size);
  return common >= 4 && containment >= 0.74;
}

function sourceFromTitle(title = "") {
  const parts = String(title).split(" - ");
  return parts.length > 1 ? parts.pop().trim() : "Google News";
}

function stripSource(title, source) {
  const suffix = ` - ${source}`;
  return String(title).endsWith(suffix)
    ? String(title).slice(0, -suffix.length).trim()
    : String(title).trim();
}

function googleUrl(query) {
  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=it&gl=IT&ceid=IT:it"
  );
}

function isBlockedSource(source = "") {
  return /(^|\s|\.)goal(?:\.com)?(\s|$)/i.test(String(source));
}

function parseGoogle(xml, category) {
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/gi) || [];

  return items
    .slice(0, 25)
    .map(item => {
      const rawTitle = tag(item, "title");
      const rssSource = tag(item, "source");
      const source =
        rssSource && rssSource !== "Google News"
          ? rssSource
          : sourceFromTitle(rawTitle);

      const title = stripSource(rawTitle, source);
      const pubDate = tag(item, "pubDate");
      const link = tag(item, "link");
      const summary = tag(item, "description");

      if (!title || !pubDate || !link || isBlockedSource(source)) return null;
      if (category === "Storie umane" && !isPositiveHumanStory(title, summary)) return null;

      return {
        title,
        summary,
        link,
        source,
        category,
        categories: [category],
        pubDate,
        googlePubDate: pubDate,
        originalPubDate: null,
        dateSource: "google",
        isVideo: /\b(video|filmato|filmati|telecamera|telecamere|ripreso|ripresa|riprese|clip|bodycam|dashcam)\b/i.test(
          `${title} ${summary}`
        ),
        sources: [
          {
            source,
            link,
            pubDate
          }
        ]
      };
    })
    .filter(Boolean);
}

async function fetchQuery(category, query) {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(googleUrl(query), {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AgostinoNewsFocus/1.0)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
          "Accept-Language": "it-IT,it;q=0.9,en;q=0.7"
        }
      });

      lastStatus = response.status;
      const text = await response.text();

      if (response.ok && text.includes("<item>")) {
        return {
          ok: true,
          status: response.status,
          category,
          query,
          news: parseGoogle(text, category)
        };
      }

      if (![429, 500, 502, 503, 504].includes(response.status)) break;
    } catch (error) {
      console.error("Focus query error:", query, error);
    }

    await sleep(1000 * attempt);
  }

  return {
    ok: false,
    status: lastStatus,
    category,
    query,
    news: []
  };
}

function categoriesOf(article) {
  return Array.isArray(article.categories)
    ? [...article.categories].filter(Boolean)
    : [article.category].filter(Boolean);
}

function addCategory(article, category) {
  const categories = categoriesOf(article);
  if (category && !categories.includes(category)) categories.push(category);
  article.categories = categories;
  if (!article.category && categories.length) article.category = categories[0];
}

function removeCategory(article, category) {
  const categories = categoriesOf(article).filter(value => value !== category);
  if (!categories.length) categories.push("Cronaca");
  article.categories = categories;
  if (article.category === category || !categories.includes(article.category)) {
    article.category = categories[0];
  }
}

function addSource(article, source) {
  const sources = Array.isArray(article.sources) ? [...article.sources] : [];
  const exists = sources.some(current =>
    current?.source === source?.source &&
    current?.link === source?.link
  );
  if (!exists && source) sources.push(source);
  article.sources = sources;
  article.sourceCount = sources.length || article.sourceCount || 1;
}

function articleText(article) {
  return normalize(`${article?.title || ""} ${article?.summary || ""}`);
}

function isCrimeImmigrationFocus(article) {
  const text = articleText(article);

  const immigration =
    /\b(immigrat|migrant|stranier|irregolar|clandestin|extracomunitar|richiedent asil|profugh|sbarch|rimpatr|cpr|accoglienz|lampedusa|ong|hotspot|barcone)\w*/.test(text);

  const crime =
    /\b(arrest|rapin|aggress|omicid|furto|violenz|stupro|stupr|molest|accoltell|coltell|pugni|picchi|rissa|spaccio|droga|evas|fuga|poliziott|carabinier|agente|denunciat|fermato|minacc|sequestr|scipp|borseggi)\w*/.test(text);

  const secondGeneration =
    /\b(italiani di seconda generazione|italiano di seconda generazione|seconda generazione|seconde generazioni)\b/.test(text);

  const youthCrime =
    /\b(baby gang|babygang|maranza|maranze)\b/.test(text)
    &&
    !/\b(rapper|trapper|cantante|musica|concerto|album)\w*/.test(text);

  return (immigration && crime) || youthCrime || (secondGeneration && crime);
}

function isStrictMITTransport(article) {
  const text = articleText(article);

  const explicitMIT =
    /\b(ministero delle infrastrutture e dei trasporti|ministero infrastrutture e trasporti|ministero dei trasporti|mit|matteo salvini|vicepremier salvini)\b/.test(text);

  const nationalBodiesOrWorks =
    /\b(ponte sullo stretto|stretto di messina|anas|rfi|rete ferroviaria italiana|ferrovie dello stato|fs italiane|tav|alta velocita|alta capacita|codice della strada|motorizzazione|patente|concessioni autostradali|autorita portuale|enac|grandi opere|infrastrutture strategiche)\b/.test(text);

  const policyContext =
    /\b(decreto|legge|norma|piano|finanziament|stanziament|investiment|appalt|gara|commissario|lavori|cantiere|cantieri|potenziament|ammodernament|sicurezza stradale|sicurezza ferroviaria)\w*/.test(text)
    &&
    /\b(infrastruttur|ferrovi|autostrad|strad|porto|porti|aeroport|trasport|mobilita)\w*/.test(text);

  return explicitMIT || nationalBodiesOrWorks || policyContext;
}

function applyFocusClassification(article) {
  const copy = {
    ...article,
    categories: categoriesOf(article),
    sources: Array.isArray(article.sources) ? [...article.sources] : []
  };

  if (isCrimeImmigrationFocus(copy)) {
    addCategory(copy, "Crimini & immigrazione");
  } else if (copy.categories.includes("Crimini & immigrazione")) {
    removeCategory(copy, "Crimini & immigrazione");
  }

  // Trasporti deve contenere SOLO MIT e dossier direttamente affini.
  if (copy.categories.includes("Trasporti") && !isStrictMITTransport(copy)) {
    removeCategory(copy, "Trasporti");
  }

  return copy;
}

function selectFocusNews(items) {
  const ordered = [...items].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  const selected = [];
  const selectedKeys = new Set();
  const keep = article => {
    const key = `${normalize(article?.title || "")}|${article?.pubDate || ""}`;
    if (selected.length >= MAX_ITEMS || selectedKeys.has(key)) return;
    selected.push(article);
    selectedKeys.add(key);
  };

  for (const [category, minimum] of [["Storie umane", 8], ["Crimini & immigrazione", 12]]) {
    ordered
      .filter(article => categoriesOf(article).includes(category))
      .slice(0, minimum)
      .forEach(keep);
  }

  ordered.forEach(keep);
  return selected.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

async function main() {
  const raw = await fs.readFile(OUT, "utf8");
  const payload = JSON.parse(raw);

  if (!payload || !Array.isArray(payload.news)) {
    throw new Error("news.json non valido");
  }

  const results = [];

  for (let i = 0; i < FOCUS_QUERIES.length; i++) {
    const [category, query] = FOCUS_QUERIES[i];
    const result = await fetchQuery(category, query);
    results.push(result);

    console.log(
      `[FOCUS ${i + 1}/${FOCUS_QUERIES.length}] ${category}: ` +
      `${result.ok ? "OK" : "FAIL"} status=${result.status} items=${result.news.length}`
    );

    if (i < FOCUS_QUERIES.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  const incoming = results
    .filter(result => result.ok)
    .flatMap(result => result.news)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const news = payload.news.map(applyFocusClassification);

  let added = 0;
  let mergedExisting = 0;

  for (const item of incoming) {
    const existing = news.find(article => sameStory(article, item));

    if (existing) {
      addCategory(existing, item.category);
      addSource(existing, item.sources?.[0]);
      existing.isVideo = Boolean(existing.isVideo || item.isVideo);
      mergedExisting++;
      continue;
    }

    const prepared = applyFocusClassification({
      ...item,
      id:
        `focus-${normalize(item.title).slice(0, 70)}-` +
        `${new Date(item.pubDate).getTime()}`,
      sourceCount: item.sources?.length || 1
    });

    news.push(prepared);
    added++;
  }

  // Secondo passaggio: classifica anche le news nuove dopo il merge.
  const finalNews = selectFocusNews(
    news.map(applyFocusClassification)
  )
    .map(article => ({
      ...article,
      sourceCount: article.sources?.length || article.sourceCount || 1
    }));

  const successfulQueries = results.filter(result => result.ok).length;
  const counts = {
    crimeImmigration: finalNews.filter(article => categoriesOf(article).includes("Crimini & immigrazione")).length,
    europe: finalNews.filter(article => categoriesOf(article).includes("Europa")).length,
    foreign: finalNews.filter(article => categoriesOf(article).includes("Esteri")).length,
    transport: finalNews.filter(article => categoriesOf(article).includes("Trasporti")).length
  };

  const output = {
    ...payload,
    total: finalNews.length,
    news: finalNews,
    focusEnrichment: {
      updatedAt: new Date().toISOString(),
      successfulQueries,
      totalQueries: FOCUS_QUERIES.length,
      added,
      mergedExisting,
      counts
    }
  };

  if (output.videoEnrichment) {
    output.videoEnrichment = {
      ...output.videoEnrichment,
      totalVideos: finalNews.filter(article => article.isVideo === true).length
    };
  }

  await fs.writeFile(
    OUT,
    JSON.stringify(output, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `Focus enrichment: +${added}, merged=${mergedExisting}, ` +
    `crimeImmigration=${counts.crimeImmigration}, Europe=${counts.europe}, ` +
    `Esteri=${counts.foreign}, Trasporti=${counts.transport}`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
