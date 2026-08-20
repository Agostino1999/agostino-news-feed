import fs from "node:fs/promises";

const OUT = "news.json";
const MAX_ITEMS = 300;
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 2;

// Quattro ricerche dedicate esclusivamente alle notizie video.
// Il feed principale resta invariato: questo passaggio lo arricchisce dopo la generazione.
const VIDEO_QUERIES = [
  ["Sicurezza", "video cronaca Italia when:1d"],
  ["Lega", 'video "Matteo Salvini" when:1d'],
  ["Storie umane", "video salvato soccorso ritrovato Italia when:2d"],
  ["Juventus", "video Juventus when:1d"]
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
        Object.prototype.hasOwnProperty.call(named, name)
          ? named[name]
          : match
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

const STOPWORDS = new Set(
  "della delle degli dello che con per una uno nel nella nelle alla alle dagli dalle sono come dopo prima tra fra sul sulla sulle dai dal del dei il lo la i gli le un di da a e o in su al ai si ha hanno essere contro piu non video news italia".split(" ")
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

  return common >= 4 && containment >= 0.72;
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
        // Questi risultati provengono da query dedicate al formato video.
        isVideo: true,
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

async function fetchVideoQuery(category, query) {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(googleUrl(query), {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AgostinoNewsVideo/1.0)",
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
      console.error("Video query error:", query, error);
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

function addUniqueCategory(article, category) {
  const categories = Array.isArray(article.categories)
    ? [...article.categories]
    : [article.category].filter(Boolean);

  if (category && !categories.includes(category)) categories.push(category);
  article.categories = categories;

  if (!article.category && categories.length) article.category = categories[0];
}

function addUniqueSource(article, source) {
  const sources = Array.isArray(article.sources)
    ? [...article.sources]
    : [];

  const exists = sources.some(current =>
    current?.source === source?.source &&
    current?.link === source?.link
  );

  if (!exists && source) sources.push(source);
  article.sources = sources;
  article.sourceCount = sources.length || 1;
}

async function main() {
  const raw = await fs.readFile(OUT, "utf8");
  const payload = JSON.parse(raw);

  if (!payload || !Array.isArray(payload.news)) {
    throw new Error("news.json non valido");
  }

  const results = [];

  for (let i = 0; i < VIDEO_QUERIES.length; i++) {
    const [category, query] = VIDEO_QUERIES[i];
    const result = await fetchVideoQuery(category, query);
    results.push(result);

    console.log(
      `[VIDEO ${i + 1}/${VIDEO_QUERIES.length}] ${category}: ` +
      `${result.ok ? "OK" : "FAIL"} status=${result.status} items=${result.news.length}`
    );

    if (i < VIDEO_QUERIES.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  const incoming = results
    .filter(result => result.ok)
    .flatMap(result => result.news)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const news = payload.news.map(article => ({
    ...article,
    categories: Array.isArray(article.categories)
      ? [...article.categories]
      : [article.category].filter(Boolean),
    sources: Array.isArray(article.sources)
      ? [...article.sources]
      : []
  }));

  let added = 0;
  let markedExisting = 0;

  for (const video of incoming) {
    const existing = news.find(article => sameStory(article, video));

    if (existing) {
      if (existing.isVideo !== true) markedExisting++;
      existing.isVideo = true;
      addUniqueCategory(existing, video.category);
      addUniqueSource(existing, video.sources?.[0]);
      continue;
    }

    news.push({
      ...video,
      id:
        `video-${normalize(video.title).slice(0, 70)}-` +
        `${new Date(video.pubDate).getTime()}`,
      sourceCount: video.sources?.length || 1
    });
    added++;
  }

  const finalNews = news
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, MAX_ITEMS)
    .map(article => ({
      ...article,
      sourceCount: article.sources?.length || article.sourceCount || 1
    }));

  const successfulQueries = results.filter(result => result.ok).length;
  const videoCount = finalNews.filter(article => article.isVideo === true).length;

  const output = {
    ...payload,
    total: finalNews.length,
    news: finalNews,
    videoEnrichment: {
      updatedAt: new Date().toISOString(),
      successfulQueries,
      totalQueries: VIDEO_QUERIES.length,
      added,
      markedExisting,
      totalVideos: videoCount
    }
  };

  await fs.writeFile(
    OUT,
    JSON.stringify(output, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `Video enrichment: +${added} news, ${markedExisting} existing marked as video, ${videoCount} total video.`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
