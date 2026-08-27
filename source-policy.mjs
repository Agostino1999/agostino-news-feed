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
  "ticino notizie",
  "calcio rosanero",
  "calciorosanero",
  "bigodino",
  "bigodino it",
  "abruzzonews24",
  "abruzzo news 24",
  "artestv",
  "artestv giornale",
  "artes tv giornale",
  "concorsando",
  "concorsando it",
  "corrierecomo it",
  "corriere como",
  "democrata",
  "eventi e news",
  "giornalemio",
  "giornalemio it",
  "in prima news",
  "inprimanews",
  "informat",
  "informat ro",
  "lamilano it",
  "la milano",
  "la tiburtina",
  "m social magazine",
  "emmepress",
  "emmepress com",
  "megamodo",
  "mondo primavera",
  "mondoprimavera",
  "pavia uno tv",
  "sport2u",
  "sport2u tv",
  "toscanews net",
  "toscana news",
  "tuttocampo",
  "velvetmag",
  "velvetmag it",
  "wine news",
  "winenews",
  "osservatorio balcani caucaso transeuropa",
  "european parliament",
  "federvolley",
  "federvolley it",
  "ppn adi",
  "ppn adi agenzia delle infrastrutture",
  "apre",
  "apre agenzia per la promozione della ricerca europea",
  "cordis",
  "cordis european commission"
]);

export const LOW_PRIORITY_SOURCE_NAMES = new Set([
  "ilsussidiario net",
  "il sussidiario",
  "affaritaliani",
  "affari italiani",
  "the social post",
  "lo spiffero",
  "l identita",
  "il giornale d italia",
  "la discussione",
  "agenparl",
  "agenda digitale",
  "la nuova bussola quotidiana",
  "la notizia",
  "giornale la voce",
  "notizie plus",
  "newsicilia",
  "new sicilia",
  "siciliaweb",
  "sicilia web",
  "radioroma it",
  "radio roma",
  "ilfaroonline",
  "il faro online",
  "trieste news",
  "verona oggi",
  "polesine24",
  "polesine 24",
  "il meridio",
  "il dolomiti",
  "larampa",
  "la rampa",
  "la voce di cesenatico",
  "teleromagna",
  "gazzetta d alba",
  "corriere dell irpinia",
  "corriere della calabria",
  "bolognatoday",
  "bologna today",
  "livornotoday",
  "livorno today",
  "ilpescara",
  "il pescara",
  "ilpiacenza",
  "il piacenza"
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
  "ticinonotizie.it",
  "bigodino.it",
  "abruzzonews24.com",
  "artestv.it",
  "concorsando.it",
  "corrierecomo.it",
  "democrata.es",
  "giornalemio.it",
  "inprimanews.it",
  "informat.ro",
  "lamilano.it",
  "latiburtinanews.it",
  "emmepress.com",
  "megamodo.com",
  "mondoprimavera.com",
  "paviaunotv.it",
  "sport2u.tv",
  "toscanews.net",
  "tuttocampo.it",
  "velvetmag.it",
  "winenews.it",
  "balcanicaucaso.org",
  "europarl.europa.eu",
  "federvolley.it",
  "apre.it",
  "cordis.europa.eu"
]);

const LOW_PRIORITY_HOSTS = new Set([
  "ilsussidiario.net",
  "affaritaliani.it",
  "thesocialpost.it",
  "lospiffero.com",
  "lidentita.it",
  "ilgiornaleditalia.it",
  "ladiscussione.com",
  "agenparl.eu",
  "agendadigitale.eu",
  "lanuovabq.it",
  "lanotiziagiornale.it",
  "giornalelavoce.it",
  "notizieplus.it",
  "newsicilia.it",
  "siciliaweb.it",
  "radioroma.it",
  "ilfaroonline.it",
  "trieste.news",
  "veronaoggi.it",
  "polesine24.it",
  "ilmeridio.it",
  "ildolomiti.it",
  "larampa.it",
  "lavocedicesenatico.it",
  "teleromagna.it",
  "gazzettadalba.it",
  "corriereirpinia.it",
  "corrieredellacalabria.it",
  "bolognatoday.it",
  "livornotoday.it",
  "ilpescara.it",
  "ilpiacenza.it"
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

export function isIrrelevantNonJuventusSport(article) {
  const title = normalizeSourceName(article?.title || "");
  if ((article?.categories || [article?.category]).some(category => ["Juventus", "Calciomercato"].includes(category))) return false;
  if (/\b(juventus|juve|bianconer)\w*/.test(title)) return false;

  const source = normalizeSourceName(article?.source || "");
  const sportsSource = /\b(calcio|calciomercato|sport(?:ivo|iva|ivi|ive)?|football|romanews|rosaner|fantacalcio|william hill|volley|pallavol|basket|tennis|formula 1|motorsport|gianluca di marzio|fabrizio romano|alfredo pedull\w*|chiamarsibomber)\b|\btuttosport\b/.test(source);
  const strongSport = /\b(calciomercato|fifa|uefa|serie [abc]|champions(?: league)?|europa league|conference league|formula 1|gran premio|motogp|mondiali|volley|pallavol|basket|tennis|calciator|allenator|centrocampist|attaccant|difensor|portier|prestito con|diritto di riscatto|obbligo di riscatto|leggend\w* del calcio)\w*/.test(title)
    || (/\bmondial\w*\b/.test(title) && /\b(sfida|gara|qualificaz)\w*/.test(title));
  const footballClub = /\b(atalanta|bologna|cagliari|como|cremonese|fiorentina|genoa|inter|lazio|lecce|milan|napoli|palermo|parma|pisa|roma|sassuolo|torino|udinese|venezia|verona)\b/.test(title);
  const footballFixture = /\b(?:atalanta|bologna|cagliari|como|cremonese|fiorentina|genoa|inter|lazio|lecce|milan|napoli|palermo|parma|pisa|roma|sassuolo|torino|udinese|venezia|verona)\s+(?:atalanta|bologna|cagliari|como|cremonese|fiorentina|genoa|inter|lazio|lecce|milan|napoli|palermo|parma|pisa|roma|sassuolo|torino|udinese|venezia|verona)\b/.test(title);
  const footballContext = /\b(partita|match|campionat|mercato|trattativ|prestito|riscatto|acquist|cession|affare|formazion|convocat|allenator|calciator|giocator|attaccant|centrocampist|difensor|portier|gol|bonus|sostitut)\w*/.test(title);
  return sportsSource || strongSport || footballFixture || (footballClub && footballContext);
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
