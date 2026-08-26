export const BLOCKED_SOURCE_NAMES = new Set([
  "zazoom",
  "zazoom social news",
  "virgilio",
  "virgilio sport",
  "blasting news",
  "agenziagiornalisticaopinione it",
  "agenzia giornalistica opinione",
  "blog ilgiornale it",
  "blog il giornale it",
  "il blog di corigliano calabro",
  "tribuna",
  "tribuna com",
  "juventus news 24",
  "juventusnews24",
  "spazioj",
  "spazio j",
  "tifo juventus",
  "tifojuventus",
  "bianconera news",
  "cronachedi",
  "cronachedi it",
  "tuttofrosinone com",
  "tutto frosinone",
  "vetrina tv",
  "vetrinatv",
  "primanotizia24 it",
  "primanotizia24",
  "canalesicilia",
  "canale sicilia",
  "italianotizie online",
  "radio senise centrale",
  "giornalesm",
  "giornale sm",
  "buonasera24",
  "musicletter",
  "ticino notizie"
]);

export const LOW_PRIORITY_SOURCE_NAMES = new Set([
  "ilsussidiario net",
  "il sussidiario",
  "affaritaliani",
  "affari italiani",
  "the social post",
  "lo spiffero",
  "l identita",
  "il giornale d italia"
]);

const BLOCKED_HOSTS = new Set([
  "zazoom.it",
  "virgilio.it",
  "blastingnews.com",
  "agenziagiornalisticaopinione.it",
  "blog.ilgiornale.it",
  "tribuna.com",
  "juventusnews24.com",
  "spazioj.it",
  "tifojuventus.it",
  "bianconeranews.it",
  "cronachedi.it",
  "tuttofrosinone.com",
  "vetrinatv.it",
  "primanotizia24.it",
  "canalesicilia.it",
  "italianotizie.online",
  "radiosenisecentrale.it",
  "giornalesm.com",
  "buonasera24.it",
  "musicletter.it",
  "ticinonotizie.it"
]);

const LOW_PRIORITY_HOSTS = new Set([
  "ilsussidiario.net",
  "affaritaliani.it",
  "thesocialpost.it",
  "lospiffero.com",
  "lidentita.it",
  "ilgiornaleditalia.it"
]);

export function normalizeSourceName(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceName(source) {
  return String(source?.source || source?.name || source || "").trim();
}

function sourceUrl(source) {
  return String(source?.originalURL || source?.link || source?.url || "").trim();
}

function sourceHost(source) {
  try {
    return new URL(sourceUrl(source)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostMatches(host, rules) {
  return [...rules].some(rule => host === rule || host.endsWith(`.${rule}`));
}

export function isBlockedSource(source) {
  const name = normalizeSourceName(sourceName(source));
  const host = sourceHost(source);
  return BLOCKED_SOURCE_NAMES.has(name) || hostMatches(host, BLOCKED_HOSTS);
}

export function isLowPrioritySource(source) {
  const name = normalizeSourceName(sourceName(source));
  const host = sourceHost(source);
  return LOW_PRIORITY_SOURCE_NAMES.has(name) || hostMatches(host, LOW_PRIORITY_HOSTS);
}

export function sourcePolicyRank(source) {
  if (isBlockedSource(source)) return 0;
  return isLowPrioritySource(source) ? 25 : 55;
}

export function sanitizeFeedArticle(article) {
  if (!article || typeof article !== "object") return null;

  const fallback = {
    source: article.source || "Fonte",
    link: article.originalURL || article.link || "",
    originalURL: article.originalURL || "",
    pubDate: article.pubDate || null
  };
  const initial = Array.isArray(article.sources) ? article.sources : [];
  const candidates = [...initial];
  if (article.source && !candidates.some(item => normalizeSourceName(sourceName(item)) === normalizeSourceName(article.source))) {
    candidates.push(fallback);
  }
  if (!candidates.length) candidates.push(fallback);

  const unique = new Map();
  for (const source of candidates) {
    if (!source || isBlockedSource(source)) continue;
    const key = `${normalizeSourceName(sourceName(source))}|${sourceUrl(source)}`;
    if (!key || unique.has(key)) continue;
    unique.set(key, { ...source, source: sourceName(source) || "Fonte" });
  }

  const sources = [...unique.values()].sort((a, b) => sourcePolicyRank(b) - sourcePolicyRank(a));
  if (!sources.length) return null;

  const primary = sources[0];
  const primaryUrl = primary.originalURL || primary.link || primary.url || article.originalURL || article.link;
  return {
    ...article,
    source: primary.source || primary.name || article.source,
    link: primaryUrl,
    originalURL: primary.originalURL || primaryUrl,
    sources,
    sourceCount: sources.length,
    sourcePriority: sourcePolicyRank(primary)
  };
}
