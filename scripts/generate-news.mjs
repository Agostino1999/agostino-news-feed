import fs from "node:fs/promises";

const OUT = "news.json";
const MAX_ITEMS = 300;
const MIN_GOOD_ITEMS = 100;
const REQUEST_DELAY_MS = 650;
const MAX_RETRIES = 3;

const QUERIES = [
  // Politica / Governo
  ["Politica", "politica italiana governo opposizione when:1d"],
  ["Politica", "politica italiana when:1h"],
  ["Governo", "governo Meloni Consiglio ministri decreto when:1d"],

  // Cronaca / Sicurezza
  ["Cronaca", "cronaca Italia when:1h"],
  ["Cronaca", "cronaca Italia arrestato aggressione rapina when:1d"],
  ["Sicurezza", "sicurezza Italia carabinieri polizia arrestato when:1d"],

  // Salvini / Lega — niente query generica "Lega" per evitare falsi positivi sportivi
  ["Lega", "\"Matteo Salvini\" when:1h"],
  ["Lega", "\"Matteo Salvini\" when:1d"],
  ["Lega", "\"Salvini\" \"Lega\" politica when:1d"],

  // Immigrazione
  ["Immigrazione", "immigrazione migranti Italia when:1h"],
  ["Immigrazione", "immigrazione migranti sbarchi ONG rimpatri Italia when:1d"],
  ["Immigrazione", "Lampedusa migranti sbarchi Italia when:2d"],

  // Crimini & immigrazione
  ["Crimini & immigrazione", "straniero arrestato Italia when:1d"],
  ["Crimini & immigrazione", "immigrato arrestato Italia when:1d"],
  ["Crimini & immigrazione", "straniero aggressione rapina Italia when:1d"],

  // Storie umane positive
  ["Storie umane", "salvato OR salvata OR soccorso OR ritrovato Italia when:2d"],
  ["Storie umane", "\"fuori pericolo\" OR \"salva la vita\" OR \"gesto eroico\" Italia when:3d"],

  // Trasporti / Europa / Esteri
  ["Trasporti", "trasporti infrastrutture ferrovie autostrade Italia when:1d"],
  ["Trasporti", "\"Ponte sullo Stretto\" Salvini MIT when:2d"],
  ["Europa", "\"Unione Europea\" Italia Commissione Parlamento Europeo when:1d"],
  ["Esteri", "esteri Europa USA guerra when:1d"],

  // Juventus / Calciomercato
  ["Juventus", "Juventus when:1h"],
  ["Juventus", "Juventus when:1d"],
  ["Calciomercato", "calciomercato Juventus when:1h"],
  ["Calciomercato", "Juventus acquisti cessioni mercato when:1d"]
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function decodeEntities(s = "") {
  const named = {
    amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
    rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
    ndash: "–", mdash: "—",
    agrave: "à", egrave: "è", eacute: "é",
    igrave: "ì", ograve: "ò", ugrave: "ù"
  };

  let out = s;
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&([A-Za-z]+);/g, (m, n) =>
        Object.prototype.hasOwnProperty.call(named, n) ? named[n] : m
      );
    if (out === prev) break;
  }
  return out;
}

function cleanText(t = "") {
  return decodeEntities(
    t.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
     .replace(/<[^>]*>/g, "")
  ).replace(/\s+/g, " ").trim();
}

function tag(item, name) {
  const m = item.match(new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"
  ));
  return m ? cleanText(m[1]) : "";
}

function normalize(s = "") {
  return s.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceFromTitle(title = "") {
  const p = title.split(" - ");
  return p.length > 1 ? p.pop().trim() : "Google News";
}

function stripSource(title, source) {
  const suffix = ` - ${source}`;
  return title.endsWith(suffix)
    ? title.slice(0, -suffix.length).trim()
    : title;
}

function googleUrl(q) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=it&gl=IT&ceid=IT:it`;
}

function parseGoogle(xml, category) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  return items.slice(0, 25).map(item => {
    const rawTitle = tag(item, "title");
    const rssSource = tag(item, "source");
    const source = rssSource && rssSource !== "Google News"
      ? rssSource
      : sourceFromTitle(rawTitle);

    const title = stripSource(rawTitle, source);
    const pubDate = tag(item, "pubDate");
    const link = tag(item, "link");
    const summary = tag(item, "description");

    if (!title || !link || !pubDate) return null;

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
      isVideo: /\b(video|filmato|telecamere|ripreso|riprese)\b/i.test(`${title} ${summary}`),
      sources: [{ source, link, pubDate }]
    };
  }).filter(Boolean);
}

async function fetchOne(category, query) {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(googleUrl(query), {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AgostinoNewsFeed/1.0)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
          "Accept-Language": "it-IT,it;q=0.9,en;q=0.7"
        }
      });

      lastStatus = res.status;
      const text = await res.text();

      if (res.ok && text.includes("<item>")) {
        return {
          ok: true,
          status: res.status,
          category,
          query,
          news: parseGoogle(text, category)
        };
      }

      if (![429, 500, 502, 503, 504].includes(res.status)) break;
    } catch {}

    await sleep(1200 * attempt);
  }

  return { ok: false, status: lastStatus, category, query, news: [] };
}

function merge(items) {
  const map = new Map();

  for (const a of items) {
    const key = normalize(a.title);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, { ...a, categories: [...(a.categories || [a.category])] });
      continue;
    }

    const e = map.get(key);

    for (const c of a.categories || [a.category]) {
      if (c && !e.categories.includes(c)) e.categories.push(c);
    }

    for (const s of a.sources || []) {
      if (!e.sources.some(x => x.source === s.source && x.link === s.link)) {
        e.sources.push(s);
      }
    }
  }

  return [...map.values()];
}

function finalClassify(a) {
  const title = (a.title || "").toLowerCase();
  const categories = [...(a.categories || [a.category]).filter(Boolean)];

  if (/\bsalvini\b/.test(title) && !categories.includes("Lega")) {
    categories.push("Lega");
  }

  return { ...a, categories };
}

async function readPrevious() {
  try {
    const raw = await fs.readFile(OUT, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.news) ? parsed : null;
  } catch {
    return null;
  }
}

async function main() {
  const previous = await readPrevious();
  const results = [];

  // Sequential fetching is deliberate: much gentler on Google than 25 simultaneous requests.
  for (let i = 0; i < QUERIES.length; i++) {
    const [category, query] = QUERIES[i];
    const result = await fetchOne(category, query);
    results.push(result);

    console.log(
      `[${i + 1}/${QUERIES.length}] ${category}: ${result.ok ? "OK" : "FAIL"} ` +
      `status=${result.status} items=${result.news.length}`
    );

    if (i < QUERIES.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  const successful = results.filter(r => r.ok);
  const errors = {};
  for (const r of results.filter(r => !r.ok)) {
    const key = String(r.status || 0);
    errors[key] = (errors[key] || 0) + 1;
  }

  let news = merge(successful.flatMap(r => r.news))
    .map(finalClassify)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, MAX_ITEMS)
    .map((a, i) => ({
      ...a,
      id: `${normalize(a.title).slice(0, 70)}-${new Date(a.pubDate).getTime()}-${i}`,
      sourceCount: a.sources?.length || 1
    }));

  // Do not destroy a healthy previous feed if Google temporarily blocks GitHub's runner.
  if (news.length < MIN_GOOD_ITEMS && previous?.news?.length >= MIN_GOOD_ITEMS) {
    console.log(
      `New feed too small (${news.length}). Keeping previous good feed (${previous.news.length}).`
    );

    const payload = {
      ...previous,
      lastAttempt: new Date().toISOString(),
      refreshOk: false,
      successfulQueries: successful.length,
      totalQueries: QUERIES.length,
      errors,
      servedPreviousGood: true
    };

    await fs.writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
    return;
  }

  const payload = {
    success: true,
    engine: "github-actions-google-news-v1",
    updatedAt: new Date().toISOString(),
    lastAttempt: new Date().toISOString(),
    refreshOk: news.length >= MIN_GOOD_ITEMS,
    successfulQueries: successful.length,
    totalQueries: QUERIES.length,
    errors,
    servedPreviousGood: false,
    total: news.length,
    news
  };

  await fs.writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Saved ${news.length} news to ${OUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
