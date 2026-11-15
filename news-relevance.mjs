// Deliberately self-contained: the dashboard embeds this same rule for local caches.
export function isOffTopicEditorialContent(article) {
  if (!article || !article.title) return false;
  const title = String(article.title).replace(/<[^>]*>/g, " ")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
  // Service listings are not news, even when a film title contains a news keyword.
  // Keep reports about television and political interviews eligible below.
  const tvListing = /\bprogrammi tv e palinsest[oi]\b|\bpalinsest[oi] e programmi tv\b/.test(title)
    || /^(?:guida tv|tv guide|programmi tv|programmi televisivi)\b/.test(title)
    || /^(?:stasera|oggi|domani|ora|cosa vedere|cosa guardare|che cosa vedere) in tv\b/.test(title)
    || /^(?:film|serie(?: tv)?) (?:di )?(?:stasera|oggi|domani)\b/.test(title);
  let tvListingURL = false;
  try {
    const url = new URL(article.originalURL || article.link || "");
    tvListingURL = /^(?:guida-?tv|tvguide)\./i.test(url.hostname)
      || /\/(?:guida[-_]tv|programmi[-_]tv|palinsesto)(?:\/|\.html?$|$)/i.test(url.pathname);
  } catch {}
  if (tvListing || tvListingURL) return true;
  // Explicit opinion labels and publisher sections identify the article's genre,
  // before political names or words such as "guerra" can make it look like news.
  const headline = String(article.title).replace(/<[^>]*>/g, " ").trim();
  const opinionHeading = /^(?:(?:l['’ʼ]\s*|(?:il|lo|la|le|gli)\s+)?(?:editorial[ei]|opinion[ei]|comment[oi]|analisi|corsiv[oi]|punto(?:\s+di\s+vista)?|rubric(?:a|he))|lettere?\s+al\s+direttore)\s*(?:[/:|–—-]|$)/i.test(headline)
    || /^(?:(?:l|il|la|lo) )?(?:editorial[ei]|corsiv[oi]) di\b/.test(title);
  let opinionSection = false;
  for (const link of [article.originalURL, article.link]) {
    try {
      const path = new URL(link).pathname;
      if (/\/(?:editorial[ei]|opinion[ei]?|commenti|corsiv[oi]|analisi|rubrica|rubriche|lettere-al-direttore|editorials|opinions|commentary|columns)(?:\/|$)/i.test(path)) opinionSection = true;
    } catch {}
  }
  if (opinionHeading || opinionSection) return true;
  // Only the actual headline can establish newsworthiness. Feed categories,
  // timestamps and unrelated text in a summary cannot rescue a lifestyle item.
  const priorityPolitics = /\b(salvini|giorgetti|calderoli|valditara|alessandra locatelli|ministro locatelli|ministra locatelli|lega nord|lega per salvini premier)\b/.test(title)
    || /\blega\b/.test(title) && /\b(partito|politic|leghist|carroccio|sede|congress|elezion|govern|ministr)\w*/.test(title);
  const publicNews = /\b(arrest|omicid|uccis|muor|morto|morta|morti|morte|decedut|aggress|rapin|stupr|accoltell|sparator|sequestr|indagat|condannat|processo|procura|tribunal|truff|maltratt|abbandonat|dispers|feriti|ferito|sfruttat|attentat|evacuat|alluvion|terremot|incendio|fran[ae]|allagament|scioper|licenziament|decreto|legge|manovra|elezion|referendum|stanziament|finanziament|fondi pubblici|appalt|pensioni|tasse|irpef|assegno unico|bonus figli|guerra|missil|bombardament|sanzion|cure negate|nega le cure|terapia negata|farmaco salvavita|malasanita|raccolta fondi|cure gratuite|dona gli organi|trapiant|soccors|salvat[oaie]|salvati|riabbraccia|lieto fine)\w*/.test(title)
    || /\b(accesso|diritto) alle cure\b|\b(?:negat|rifiut)\w*\b.*\b(cure|farmac|terapi|casa|alloggi)\w*|\b(cure|farmac|terapi|casa|alloggi)\w*\b.*\b(?:negat|rifiut)\w*|\b(?:poliziott|carabinier|vigili del fuoco|medic|infermier|cane|gatto)\w*\b.*\bsalva\b/.test(title);
  if (priorityPolitics || publicNews) return false;

  const parenting = /\b(genitorialita|educazione emotiva|intelligenza emotiva)\b/.test(title)
    || /\b(riconoscere|comprendere|capire|gestire|educare|ascoltare|crescere|aiutare)\b.*\b(emozioni|nostri figli|propri figli|bambini|adolescenti)\b/.test(title)
    || /\b(emozioni|capricci|autostima)\b.*\b(figli|bambini|genitori|adolescenti)\b/.test(title)
    || /\b(figli|bambini|genitori|adolescenti)\b.*\b(emozioni|capricci|autostima)\b/.test(title);
  const advice = /\b(consigli|come|quando|perche|cosa|quali|controlli da fare|sintomi|rimedi|benefici|prevenzione)\b/.test(title);
  const wellness = /\b(benessere|dieta|dimagrire|alimentazione|sonno|dormire|ansia|stress|psicolog|prevenzione|invecchiare|pelle|capelli|colesterolo|integratori|salva la vita|pene|cuore|autostima)\w*/.test(title);
  const entertainment = /\b(oroscopo|zodiaco|ballando(?: con le stelle)?|grande fratello|the voice|uomini e donne|temptation island|isola dei famosi|gossip|red carpet|debutto in societa|look|outfit|ricettario|ricette|ricetta del giorno|shopping|black friday|codice sconto|cuochi|tour gastronomico)\b/.test(title);
  const culturePromotion = /\b(festival|food expo|fiera dei presepi|music week|area sanremo|nuovo album|canzone natalizia|presenta(?:re|zione)? (?:il suo |un |il )?nuovo libro|seconda giornata di incontri|laboratori per bambini|mercatini|sagra|motori magazine|tg ambiente|centro commerciale)\b/.test(title);
  const digest = /^(accadeoggi|accade oggi|tg news|video tg5|ultime notizie|le notizie del giorno)\b/.test(title);
  let path = "";
  try { path = new URL(article.originalURL || article.link || "").pathname.toLowerCase(); } catch {}
  const lifestyleSection = /\/(?:spettacoli|gossip|people|moda|beauty|cucina|ricette|benessere|tempo-libero|tempo_libero)(?:\/|[._-])/.test(path);
  return parenting || advice && wellness || entertainment || culturePromotion || digest || lifestyleSection;
}
