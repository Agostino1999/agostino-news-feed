import fs from "node:fs/promises";

const FILE = "news.json";

function normalizeSource(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isBlockedSourceValue(value = "") {
  const source = normalizeSource(value);
  return (
    source === "goal.com" ||
    source === "goal" ||
    source.includes("goal.com")
  );
}

function isBlockedLink(value = "") {
  return (
    typeof value === "string" &&
    value.toLowerCase().includes("goal.com")
  );
}

function sanitizeArticle(article = {}) {
  const safeSources = Array.isArray(article.sources)
    ? article.sources.filter(source => {
        if (!source || typeof source !== "object") {
          return false;
        }

        return !(
          isBlockedSourceValue(source.source) ||
          isBlockedLink(source.link) ||
          isBlockedLink(source.originalURL)
        );
      })
    : [];

  const mainIsBlocked =
    isBlockedSourceValue(article.source) ||
    isBlockedLink(article.link) ||
    isBlockedLink(article.originalURL);

  if (mainIsBlocked && safeSources.length === 0) {
    return null;
  }

  const sanitized = {
    ...article,
    sources: safeSources,
    sourceCount: safeSources.length || 1
  };

  if (mainIsBlocked && safeSources.length > 0) {
    const replacement = safeSources[0];

    sanitized.source = replacement.source || sanitized.source;
    sanitized.link = replacement.originalURL || replacement.link || sanitized.link;
    sanitized.originalURL = replacement.originalURL || replacement.link || sanitized.originalURL;

    if (replacement.pubDate) {
      sanitized.pubDate = replacement.pubDate;
    }
  }

  return sanitized;
}

const raw = await fs.readFile(FILE, "utf8");
const payload = JSON.parse(raw);

if (!Array.isArray(payload.news)) {
  throw new Error("news.json does not contain a news array");
}

const before = payload.news.length;

payload.news = payload.news
  .map(sanitizeArticle)
  .filter(Boolean);

payload.total = payload.news.length;
payload.blockedSources = ["Goal.com"];

await fs.writeFile(
  FILE,
  JSON.stringify(payload, null, 2) + "\n",
  "utf8"
);

console.log(`Blocked sources cleanup: ${before} -> ${payload.news.length}`);
