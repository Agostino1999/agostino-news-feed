import { isAllowedSportsSource } from "../source-policy.mjs";

const DAY = 86400000;
const FALLBACK_LIMIT = 45;

function normalize(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const PUBLIC_ACTION = /\b(arrestat|omicid|aggress|violenz|rapin|spacci|denunciat|indagat|inquest|sequestr|espuls|condann|scarcer|abbandonat|maltratt|soccors|salvat|ritrovat|guarit|scioper|attentat|ordignan|sparator|processo|procura|tribunal|decret|manovra|disegno di legge|mozione|elezion|votazion|consiglio dei ministri|fondi pubblici|finanziament|stanziament|inaugurazion|commissariament|dimission|dimess|dimett|appalt|infrastruttur|riapertur|cantier|protest|manifestazion|impeachment|sanzion|guerra|missil)\w*/;
const PEOPLE = /\b(mamma|madre|papa|padre|bambin|figli|famigli|pazient|anzian|disabil|malat|student|lavorator|volontar|donna|uomo|ragazz)\w*/;
const HELP_OR_ACCESS = /\b(raccolta fondi|curarsi|cure gratuite|farmaco salvavita|terapia negata|accesso alle cure|aiuto|aiutati|solidariet|lieto fine|riabbraccia|salva la vita|soccors|fuori pericolo|donazione|donero|donera)\w*/;
const PUBLIC_HOUSING = /\b(migrant|profugh|richiedent asil)\w*.*\b(casa|abitazion|alloggi|appartament|accoglienz)\w*|\b(casa|abitazion|alloggi|appartament|accoglienz)\w*.*\b(migrant|profugh|richiedent asil)\w*/;
const PUBLIC_BODY = /\b(comun[ei]|sindac|provinc|region|minister|govern|parlament|senato|commissione europea|unione europea|anac|consob|agenzia entrate|polizia|carabinier)\w*/;
const MUSIC_OR_ART = /\b(concert[oi]|orchestr[ae]|discografic|nuovo live|album|jazz|interludio|blues|risonanze collettive|op[ea]ra per voce sola|mostra d arte|mostra fotografica|recensione|romanzo|spettacolo teatrale|ballo viennese|la cultura si mobilita|red carpet|suonare e giocare con la musica)\w*/;
const LEISURE = /\b(sagr[ae]|mercatini|slow food|osterie d italia|tuttomele|roma chocolate|grande fratello vip|fratelli di crozza|aperitivo con delitto|assaggi gratuiti|laboratori per bambini|racing show|calendario storico|tour gastronomico|shopping|migliori quote|pronostici scommesse|ricetta del giorno)\w*/;
const DIGEST = /^(accadeoggi|accade oggi|tg news|video tg5|ultime notizie|le notizie del giorno)\b|\b(prima pagina.*(?:edicola oggi|rassegna stampa|scarica gratis pdf)|titel.?seite zeitung|rassegna stampa in edicola oggi)\b/;

// Ministri indicati da https://legaonline.it/governo/ (verifica: 7 novembre 2026).
export const LEGA_MINISTER_QUERIES = [
  ["Lega", 'Giorgetti when:2d'],
  ["Lega", 'Calderoli when:2d'],
  ["Lega", 'Valditara when:2d'],
  ["Lega", '("Alessandra Locatelli" OR "ministro Locatelli" OR "Locatelli disabilità") when:2d']
];

const LEGA_MINISTER_SURNAME = /\b(salvini|giorgetti|calderoli|valditara)\b/;
const LEGA_MINISTER_NAME = /\b(matteo salvini|giancarlo giorgetti|roberto calderoli|giuseppe valditara|alessandra locatelli|ministr[ao] locatelli)\b/;
const LOCATELLI_PORTFOLIO = /\b(disabilit|accessibilit|inclusion|caregiver|progetto di vita|non autosufficien)\w*/;
const PARTY_CONTEXT = /\b(partit[oi]|politic|carroccio|consiglio federal|congress|elezion|coalizion|salvini|fontana|zaia|fedriga|giorgetti|calderoli|molinar|romeo|borghi|rinaldi|vannacci|gruppo parlamentare)\w*/;
const SPORTS_LEAGUE = /\blega (?:serie [a-d]|pro|calcio|pallavolo|basket|dilettant|nazionale dilettanti)\b/;

export function matchesLegaNews({ title = "", summary = "" }) {
  const headline = normalize(title);
  const text = headline + " " + normalize(summary);
  if (LEGA_MINISTER_SURNAME.test(headline) || LEGA_MINISTER_NAME.test(text)) return true;
  if (/\blocatelli\b/.test(headline) && LOCATELLI_PORTFOLIO.test(text) && !/\bmanuel locatelli\b/.test(text)) return true;
  if (/\b(lega nord|lega per salvini premier|lega salvini premier|leghist[aeio])\b/.test(text)) return true;
  return /\blega\b/.test(text) && PARTY_CONTEXT.test(text) && !SPORTS_LEAGUE.test(headline);
}

function editorialRank(article) {
  const title = normalize(article.title);
  const summary = normalize(article.summary);
  const text = title + " " + summary;
  const categories = article.categories || [article.category];

  // A mention of Gaza or a politician inside a review does not make it news about that subject.
  if (DIGEST.test(title) || /\bfratelli di crozza\b/.test(title)) return -1;
  if ((MUSIC_OR_ART.test(title) || LEISURE.test(title) || MUSIC_OR_ART.test(summary)) && !PUBLIC_ACTION.test(title)) return -1;

  if (matchesLegaNews(article)) return 4;
  if ((PEOPLE.test(text) && HELP_OR_ACCESS.test(text))
    || (PUBLIC_HOUSING.test(text) && PUBLIC_BODY.test(text))) return 3;
  if (PUBLIC_ACTION.test(title)
    || (PUBLIC_BODY.test(title) && /\b(nomin|incaric|ritir|rinunci|approv|tassar|pension|tregua|dichiarazion|diritt)\w*/.test(title))
    || /\b(meloni|orban|vannacci|palazzo chigi|ponte sullo stretto|codice della strada|anac)\b/.test(title)) return 2;
  if (categories.some(category => ["Storie umane", "Immigrazione", "Crimini & immigrazione", "Lega", "Governo", "Europa", "Esteri", "Trasporti", "Juventus", "Calciomercato", "Sport"].includes(category))
    || (PUBLIC_BODY.test(text) && PUBLIC_ACTION.test(text))
    || /\b(juventus|juve|serie a|coppa davis|champions league|formula 1|motogp)\b/.test(title)) return 1;
  return 0;
}

// Keep space for relevant developments and a small discovery buffer for atypical titles.
export function selectEditorialNews(articles, { limit = 300, reportedLinks = new Set(), now = Date.now() } = {}) {
  const ranked = articles.map(article => ({
    article,
    time: Date.parse(article.pubDate),
    rank: editorialRank(article),
    reported: reportedLinks.has(article.originalURL || article.link)
  })).filter(item => Number.isFinite(item.time) && (item.reported || item.rank >= 0));
  const ordered = ranked.sort((a, b) => b.rank - a.rank || b.time - a.time);
  const selected = new Map();
  const keep = item => {
    if (selected.size >= limit) return;
    const key = normalize(item.article.title) + "|" + item.time;
    if (!selected.has(key)) selected.set(key, item);
  };

  ordered.filter(item => item.reported).forEach(keep);
  for (const [category, minimum] of [["Storie umane", 12], ["Immigrazione", 10], ["Crimini & immigrazione", 12], ["Juventus", 20]]) {
    let candidates = ordered.filter(({ article, time, rank }) =>
      rank > 0 && now - time <= 4 * DAY && time <= now + 10 * 60000
      && (article.categories || [article.category]).includes(category)
    );
    if (category === "Juventus") {
      // Preserve news that survives the dashboard's existing sports-source policy.
      candidates = candidates.filter(({ article }) =>
        [article, ...(Array.isArray(article.sources) ? article.sources : [])].some(isAllowedSportsSource)
      ).sort((a, b) => b.time - a.time);
    }
    candidates.slice(0, minimum).forEach(keep);
  }
  ordered.filter(item => item.rank > 0).forEach(keep);
  ordered.filter(item => item.rank === 0).slice(0, FALLBACK_LIMIT).forEach(keep);
  return [...selected.values()].sort((a, b) => b.time - a.time).map(item => item.article);
}
