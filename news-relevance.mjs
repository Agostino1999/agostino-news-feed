// Deliberately self-contained: the dashboard embeds this same rule for local caches.
export function isOffTopicEditorialContent(article) {
  if (!article || !article.title) return true;
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
  const publicNews = /\b(arrest|omicid|uccis|muor|morto|morta|morti|morte|decedut|aggress|rapin|stupr|accoltell|sparator|sequestr|indagat|condannat|processo\b|procura|tribunal|truff|maltratt|abbandonat|dispers|feriti|ferito|sfruttat|attentat|evacuat|alluvion|terremot|incendio|fran[ae]|allagament|scioper|licenziament|decreto|legge\b|manovra|elezion|referendum|stanziament|finanziament|fondi pubblici|appalt|pensioni|tasse\b|irpef|assegno unico|bonus figli|guerra|missil|bombardament|sanzion|cure negate|nega le cure|terapia negata|farmaco salvavita|malasanita|raccolta fondi|cure gratuite|dona gli organi|trapiant|soccors|salvat[oaie]|salvati|riabbraccia|lieto fine)\w*/.test(title)
    || /\b(accesso|diritto) alle cure\b|\b(?:negat|rifiut)\w*\b.*\b(cure|farmac|terapi|casa|alloggi)\w*|\b(cure|farmac|terapi|casa|alloggi)\w*\b.*\b(?:negat|rifiut)\w*|\b(?:poliziott|carabinier|vigili del fuoco|medic|infermier|cane|gatto)\w*\b.*\bsalva\b/.test(title);
  // A football director named Salvini is not Matteo Salvini.
  const sportsNamesake = /\bsalvini\b/.test(title)
    && /\b(gubbio|frosinone|direttore sportivo|nomina a ds)\b/.test(title)
    && !/\b(matteo salvini|ministr|politic|lega|governo)\w*/.test(title);
  if (sportsNamesake) return true;
  if (priorityPolitics) return false;

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
  const servicePage = /\b(tutte le (?:ultime )?notizie in tempo reale|notizie correlate|profilo e statistiche|calendario e risultati|statistiche fantacampionato)\b/.test(title)
    || /^(?:rassegna stampa|prime pagine)\b/.test(title);
  if (servicePage || digest) return true;

  // Promotions and celebrity interviews cannot be rescued by a generic word
  // such as "morta", "politica" or a stray reference to war in a film title.
  const concreteEvent = /\b(arrest|omicid|uccis|aggress|rapin|stupr|accoltell|sparator|sequestr|indagat|condannat|truff|maltratt|incident|incendio|terremot|alluvion|scioper|licenziament|cure negate|terapia negata|farmaco salvavita|raccolta fondi|trapiant|soccors|salvat)\w*/.test(title)
    || /\b(poliziott|carabinier|vigili del fuoco|medic|infermier)\w*/.test(title) && /\bsalva la vita\b/.test(title);
  const promotion = culturePromotion || /\b(parata di natale|mercatino|mercatini|fiera|fiere|mostra|musei|museo|archeologia|arte racconta|arte raccontano|canta per|premio ciampi|ospite a stories|contestato lo spettacolo|ricordo dello scampato terremoto|nuovo locale|fine dining|formaggio italiano|burrata|campus|iscrizioni|settimana dedicata|stella michelin|rewriters fest|hall of fame|nuova serie|serie futurista|star wars|blade runner)\b/.test(title);
  const personalMoneyAdvice = /\b(stipendi ecco i lavori|guadagno \d+\w* euro|come risparmiare|come risparmiano)\b/.test(title);
  const celebrity = /\b(william e kate|kate middleton|principessa|ambra angiolini|angelina mango|massimiliano rosolino|phil collins)\b/.test(title);
  if ((parenting || advice && wellness || personalMoneyAdvice || entertainment || promotion || celebrity || lifestyleSection) && !concreteEvent) return true;

  // Admission requires an actual subject in the headline. A recent timestamp,
  // a feed's category or unrelated summary text never establish relevance.
  const politics = /\b(meloni|tajani|piantedosi|crosetto|nordio|schlein|conte\b|vannacci|zaia|fedriga|giulia bongiorno|palazzo chigi|camera dei deputati|consiglio dei ministri|governo|parlament|senato|europarlament|eurodeputat|elezion|referendum|partit[oi]|coalizion|centrodestra|centrosinistra|campo largo|forza italia|fratelli d italia|movimento 5 stelle|m5s|partito democratico|consiglio comunale|ministro|ministra|ministero|pd\b|salis|de luca|progetto civico italia|agora per l italia)\w*/.test(title);
  const immigration = /\b(migrant|immigra|profugh|rifugiat|sbarch|rimpatr|espuls|cpr|lampedusa|barcon|ius soli|ius scholae|permesso di soggiorno|cittadinanza italiana|accoglienza migranti|pakistan|islamofob|islamism)\w*/.test(title);
  const publicAffairs = /\b(codice della strada|ponte sullo stretto|anas\b|ferrovi|trasport|autostrad|aeroport|monopattini|semafori|sicurezza stradale|caos nei cieli|voli|treni\b|treno\b|eurocity|metropolitan|mobilita|infrastruttur|statale|piano casa|emergenza affitti|alloggi|affitti|caregiver|non autosufficien|disabil|sanita|malasanita|vaccin|epidemi|poverta|povert|inflazion|carovita|occupazion|disoccupazion|stipendi|salari|welfare|pnrr|riforma pac|dimission|si dimette|si e dimesso|credito per le spese|qualita della vita|famiglie svantaggiate|nuovo rapporto sulla scuola|scuole occupate|protest|manifestazion|solidarieta|centri di assistenza|irpef|patrimoniale|truff|droga|ladri|ladro|armi|estorsion|furti|furto|risse|rissa|baby gang|babygang|criminalita|degrado|denunc|licenza sospesa|multa|narcosub|minorenne partorisce|neonata trovata senza vita|sentenza|controinterrogatorio|colpi d arma|sparo|spari|agguato|feriti|gravissimo|machete)\w*/.test(title);
  const foreign = /\b(unione europea|commissione europea|parlamento europeo|consiglio europeo|bruxelles|nato|ucrain|russ|cremlin|londra|mosca|kiev|zelensky|putin|trump|xi\b|kallas|biden|orban|gaza|hamas|israele|iran|teheran|hormuz|casa bianca|diplomazi|negoziat|cessate il fuoco|tregua|vertice|pace mondiale)\w*/.test(title);
  const humanStory = /\b(salva la vita|salvano la vita|vite salvate|gesto eroico|lieto fine|riabbraccia|sopravvissut|torna a camminare|torna a casa|cure gratuite|accesso alle cure|dona gli organi|donazion|solidariet|aiuto per mangiare|soccorritori|salvano)\w*/.test(title)
    || /\b(poliziott|carabinier|vigili del fuoco|infermier|medic)\w*/.test(title) && /\b(figli[oa]|padre|madre|mamma|papa)\b/.test(title) && /\b(pensione|ultimo turno|fianco a fianco|passaggio di testimone)\b/.test(title);
  // Keep national/international sports coverage; local score snippets and
  // fantasy-game advice do not become public affairs through a wrong category.
  const nationalSport = /\b(juventus|juve|bianconer|calciomercato|spalletti|continassa|amorim|leao|pagelle italia|belgio italia|ancelotti|serie a|champions league|europa league|conference league|nations league|euro 20\d\d|mondiali|olimpiad|paralimpiad|formula 1|formula uno|motogp|gran premio|atp|wta|wimbledon|roland garros|us open|coppa davis|sinner|alcaraz|djokovic|musetti|berrettini|sabalenka|verstappen|leclerc|hamilton|antonelli|figc|uefa|fifa|nazionale|azzurri|azzurro|donnarumma|heysel)\w*/.test(title)
    || /\b(milan|inter|napoli|atalanta|roma|lazio|fiorentina|bologna|torino|como|palermo)\b/.test(title) && /\b(portier|attaccant|difensor|centrocampist|maignan|zaccagni|frattesi|tavares|allenator|calciator|spalletti|derby|mercato|trattativ|trasferisc|ufficiale|rosanero|affare|accordo|club|prestito|riscatto|acquist|cession|infortun|assalto|obiettivo|recuper|campionat|serie a|scudetto|champions)\w*/.test(title);
  const emergency = /\b(maltempo|allerta|bombe d acqua|allagament|fran[ae]|evacuat|dispers|incidente|muore|morto|morta|morti|decedut)\w*/.test(title);
  return !(publicNews || politics || immigration || publicAffairs || foreign || humanStory || nationalSport || emergency);
}
