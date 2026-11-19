// Shared with agostino-news-feed/news-intelligence.js. Pure, dependency-free rules.
// Headline evidence wins over publisher names, search hints and related-link summaries.
(function (root) {
  "use strict";
  const HOUR = 3600000;
  const normalize = value => String(value || "").replace(/<[^>]*>/g, " ").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const stop = new Set("della delle degli dello che con per una uno nel nella nelle alla alle dagli dalle sono come dopo prima oggi ieri tra fra sul sulla sulle dai dal del dei il lo la gli le un di da a e o in su al ai si ha hanno essere contro piu non nuovo nuova nuovi nuove news italia italiano italiana italiani italiane ultime ultima ultimo live diretta video foto immagini cosa ecco tutto tutta tutti tutte molto ancora anche secondo verso senza solo anno anni mese mesi giorno giorni ora ore parla dice detto fatto fare caso casi serie calcio partita partite squadra squadre club stagione campionato milioni mila euro resta forza casa europa governo politica salvini meloni juve juventus roma milano napoli inter lega ministro presidente punto parole annuncia commenta arriva notizie scopri leggi notizia ultime aggiornamenti".split(" "));
  const words = value => normalize(value).split(" ").filter(word => word.length >= 4 && !stop.has(word) && !/^\d+$/.test(word));
  function evidence(article) {
    const title = normalize(article.title);
    const raw = String(article.summary || "").split(/leggi anche|potrebbe interessarti|notizie correlate|altri articoli/i)[0];
    const summary = normalize(raw);
    const overlap = [...new Set(words(title))].filter(word => new Set(words(summary)).has(word)).length;
    // Descriptions are optional: unrelated RSS roundups must never change categories.
    return title + (overlap >= 2 ? " " + summary.slice(0, 700) : "");
  }
  function isJuventusCoverage(article) {
    const title = normalize(article?.title);
    if (/\b(juventus|juve)\b/.test(title)) return true;
    if (/\bbianconer\w*/.test(title) && !/\b(udinese|cesena|ascoli|siena)\b/.test(title)) return true;
    if (!/\b(napoli|milan|inter|udinese|atalanta|roma|lazio)\b/.test(title)) {
      try { if (/\/(juventus|juve)(?:[/-]|$)/i.test(new URL(article.originalURL).pathname)) return true; } catch {}
      if (/\bcontinassa\b/.test(title)) return true;
    }
    const text = evidence(article || {});
    return /\b(juventus|juve)\b/.test(text)
      && !/\b(napoli|milan|inter|udinese|atalanta|roma|lazio)\b/.test(title);
  }
  function isPoliticalLega(article) {
    const title = normalize(article.title), text = evidence(article);
    if (/\b(gubbio|frosinone|direttore sportivo|nomina a ds)\b/.test(title)
      && !/\b(matteo salvini|ministero|vicepremier)\b/.test(title)) return false;
    if (/\b(salvini|giorgetti|calderoli|valditara|alessandra locatelli|ministr[ao] locatelli|lega nord|lega per salvini premier|leghist[aeio])\b/.test(title)) return true;
    if (/\blocatelli\b/.test(title) && /\b(disabilit|caregiver|accessibilit|inclusion)\w*/.test(text)
      && !/\bmanuel locatelli\b/.test(text)) return true;
    return /\blega\b/.test(title) && /\b(partit|politic|carroccio|congress|elezion|coalizion|parlament|salvini|fontana|zaia|fedriga|giorgetti|calderoli|molinar|romeo|borghi|segretari|emendament|bicchielli|forza italia|passa alla lega|entra nella lega|deposita|proposta|deputat)\w*/.test(text)
      && !/\blega (?:serie|pro|calcio|pallavolo|basket|dilettanti)\b/.test(title);
  }
  function hasImmigrationContext(text) {
    return /\b(migrant|immigra|extracomunitar|profugh|rifugiat|richiedent\w* asil|sbarch|sbarco|rimpatr|espuls|cpr|lampedusa|barcon|ius soli|ius scholae|ius sanguinis|permess[oi] di soggiorno|asilo politic|protezione internazionale|decreto flussi|flussi migratori|centr[oi] di accoglienza|centr[oi] per (?:il rimpatrio|i rimpatri)|second[ae] generazion|genitori stranieri|riforma della cittadinanza)\w*/.test(text)
      || /\b(ong|hotspot)\b/.test(text) && /\b(mediterraneo|soccors|migrant)\w*/.test(text)
      || /\b(stranier|extracomunitar)\w*/.test(text) && /\b(irregolar|clandestin|espuls|rimpatr)\w*/.test(text);
  }
  function classifyArticle(article) {
    if (!article || !article.title) return article;
    const title = normalize(article.title), text = evidence(article);
    const prior = (article.categories || [article.category]).filter(Boolean);
    const categories = new Set(prior);
    const set = (category, yes) => yes ? categories.add(category) : categories.delete(category);
    const juve = isJuventusCoverage(article), lega = isPoliticalLega(article);
    const foreign = /\b(trump|stati uniti|usa|casa bianca|ucrain|zelensky|russ|putin|mosca|cremlin|britann|israele|gaza|iran|teheran|cina|pechino|taiwan|myanmar|rohingya|nato|xi|shenzhen|merz|macron|starmer|netanyahu|orban|argentina|sudan|libano|siria|volenterosi)\w*/.test(title);
    const europe = /\b(unione europea|commissione europea|parlamento europeo|consiglio europeo|europarlament|eurodeputat|bruxelles|ue)\w*/.test(title);
    const foreignGovernment = /\b(governo|ministr[oa]) (?:ucraino|russo|britannico|inglese|francese|tedesco|spagnolo|americano|statunitense|israeliano|iraniano|cinese)\b/.test(title);
    const government = /\b(meloni|palazzo chigi|consiglio dei ministri|governo italiano)\b/.test(title)
      || lega && /\b(salvini|giorgetti|calderoli|valditara|alessandra locatelli|ministr[ao] locatelli)\b/.test(title)
      || !foreignGovernment && !foreign && /\b(governo|ministero|ministr[ao]|manovra|decreto legge|decreto legislativo)\b/.test(title);
    const political = government || lega || /\b(parlament|senato|camera dei deputati|maggioranza|opposizione|partito|partiti|elezion|coalizion|forza italia|fratelli d italia|m5s|partito democratico|tajani|schlein|giuseppe conte|piantedosi|crosetto|nordio|fedriga|zaia|centrodestra|centrosinistra|sinistra|destra|fdi|pd|pds|vannacci|consiglio comunale|sindac|assessor|consiglier|coordinatore)\w*/.test(title);
    const sport = juve || /\b(serie [abc]|champions league|europa league|conference league|fifa|uefa|calcio|calciator|allenator|portier|difensor|centrocampist|attaccant|tennis|formula 1|motogp|basket|volley|nuoto|ciclismo|sinner|alcaraz|spalletti)\w*/.test(title)
      || /\b(napoli|milan|inter|atalanta|roma|lazio|torino|udinese)\b/.test(title) && /\b(mercato|prezzo|riscatto|prestito|partita|gol|acquist|trattativ|infortun)\w*/.test(title);
    const market = /\bcalciomercato\b/.test(title) || sport && /\b(acquist|cession|ceder|prestito|trattativ|offert|accordo|firma|ingaggio|riscatto|parametro zero|trasferiment|entourage|procurator|prezzo|mercato)\w*/.test(title);
    const crime = /\b(arrest|rapin|aggress|omicid|furto|furti|violenz|stupro|stupr|molest|accoltell|spaccio|droga|denunciat|fermat[oi]|minacc|sequestr|scipp|borseggi|condann|indagat)\w*/.test(title);
    const immigration = hasImmigrationContext(title);
    const foreignPerson = /\b(stranier|extracomunitar|immigrat|migrant|irregolar|richiedent\w* asil|seconda generazione|tunisino|marocchino|algerino|senegalese|pakistano|egiziano|albanese|romeno|rumeno|bengalese)\w*/.test(title);
    const youthCrime = /\b(baby gang|babygang|maranza|maranze)\b/.test(title) && !/\b(rapper|trapper|musica|album|cantante)\b/.test(title);
    const transport = /\b(tav|anas|rfi|enac)\b/.test(title) || /\b(ponte sullo stretto|stretto di messina|rete ferroviaria italiana|ferrovie dello stato|fs italiane|alta velocita|codice della strada|motorizzazione|patent|concessioni autostradali|autorita portuale|grandi opere|infrastrutture strategiche|ministero delle infrastrutture e dei trasporti)\w*/.test(title)
      || /\b(trasport|ferrovi|autostrad|aeroport|infrastruttur|treni|treno|mobilita)\w*/.test(title) && /\b(salvini|mit|decreto|legge|piano|finanziament|stanziament|investiment|appalt|cantier|lavori|potenziament)\w*/.test(title);
    set("Juventus", juve); set("Lega", lega); set("Governo", government);
    set("Politica", political); set("Immigrazione", immigration);
    set("Crimini & immigrazione", crime && (immigration || foreignPerson) || youthCrime);
    set("Trasporti", transport); set("Europa", europe); set("Esteri", foreign && !europe);
    set("Calciomercato", market); set("Sport", sport && !market);
    set("Sicurezza", crime && !foreign);
    if (/\b(mort|muor|decedut|cadavere|uccis|omicid|strage|funeral|lutto)\w*/.test(title)
      || /\bcorpo\b/.test(title) && /\britrovat\w*/.test(title)) categories.delete("Storie umane");
    // Preserve the existing positive-human-story selection; do not infer it from "salva" alone.
    const priority = ["Trasporti", "Crimini & immigrazione", "Lega", "Calciomercato", "Juventus", "Storie umane", "Governo", "Politica", "Immigrazione", "Sicurezza", "Europa", "Esteri", "Sport"];
    if (categories.size > 1 || !categories.has("Cronaca") && categories.size) categories.delete("Cronaca");
    if (!categories.size) categories.add("Cronaca");
    const ordered = [...categories].sort((a,b) => (priority.indexOf(a) < 0 ? 99 : priority.indexOf(a)) - (priority.indexOf(b) < 0 ? 99 : priority.indexOf(b)));
    return {...article, category: ordered[0], categories: ordered, classificationVersion: 2};
  }

  // Specific issues precede broader dossiers. A politician alone is never a topic.
  const definitions = [
    ["pensioni-quota64", "Pensioni a 64 anni", /\b(quota 64|pension\w*.{0,45}64 anni|64 anni.{0,45}pension)/, "politica"],
    ["scuola-organici", "Organici e tagli alla scuola", /\b(scuol|docent|insegnant|ata\b)\w*/ , "politica", /\b(tagli|organic|assumer|assunz|stipendi|precariat|riduzion)\w*/],
    ["lista-ucraina", "Lista ucraina: Salvini e Vannacci", /\b(ucrain|kiev|anti kiev)\w*/, "politica", /\b(lista|proscrizione|schedat|criminali)\w*/],
    ["antisemitismo-ddl", "Ddl antisemitismo", /\bantisemitismo\b/, "politica", /\b(ddl|disegno di legge|legge|senato|emendament)\w*/],
    ["zes-unica", "Zes unica nazionale", /\bzes\b/, "politica"],
    ["bicchielli-lega", "Bicchielli passa alla Lega", /\bbicchielli\b/, "politica", /\b(lega|forza italia)\b/],
    ["commissione-cyber", "Attacco informatico alla Commissione UE", /\b(commissione europea|commissione ue)\b/, "esteri", /\b(attacco informatico|hacker|cyber)\w*/],
    ["vertice-volenterosi", "Vertice dei Volenterosi", /\bvolenterosi\b/, "esteri"],
    ["vertice-trump-xi-putin", "Vertice tra Trump, Xi e Putin", /\b(xi|shenzhen)\b/, "esteri", /\b(trump|putin|vertice)\b/],
    ["ponte-kerch", "Attacchi al ponte di Kerch", /\b(ponte|kerch)\b/, "esteri", /\b(crimea|kerch|putin)\b/],
    ["ponte-stretto", "Ponte sullo Stretto", /\b(ponte sullo stretto|stretto di messina)\b/, "politica"],
    ["codice-strada", "Codice della strada", /\bcodice della strada\b/, "politica"],
    ["autovelox", "Regole e controlli sugli autovelox", /\bautovelox\b/, "politica"],
    ["manovra", "Manovra di bilancio", /\b(manovra|legge di bilancio)\b/, "politica"],
    ["pensioni-riforma", "Riforma delle pensioni", /\b(pensioni|fornero|previdenza)\b/, "politica", /\b(riforma|legge|quota|eta|uscita|anticipat|governo|salvini)\w*/],
    ["sciopero-generale", "Sciopero generale", /\bsciopero generale\b/, "politica"],
    ["decreto-flussi", "Decreto flussi", /\b(decreto flussi|flussi migratori)\b/, "sicurezza"],
    ["cittadinanza", "Riforma della cittadinanza", /\b(ius soli|ius scholae|ius sanguinis|riforma della cittadinanza|referendum cittadinanza)\b/, "politica"],
    ["centri-albania", "Centri per migranti in Albania", /\balbania\b/, "sicurezza", /\b(migrant|centr|cpr|rimpatr)\w*/],
    ["rohingya-myanmar", "Myanmar e genocidio dei rohingya", /\brohingya\b/, "esteri"],
    ["milano-urbanistica", "Inchiesta urbanistica a Milano", /\b(milano|ex trotto)\b/, "politica", /\b(urbanistic|lottizzazion|trotto)\w*/]
  ];
  function articleKey(article) {
    return article.originalURL || article.link || normalize(article.title);
  }
  function publisherKey(source) {
    const name = normalize(typeof source === "string" ? source : source?.source || source?.name || "");
    if (/^(corriere della sera|corriere roma|corriere milano|corriere it)$/.test(name)) return "corriere della sera";
    if (/^(sky tg24|tg24 sky it)$/.test(name)) return "sky tg24";
    if (/^(tuttojuve|tutto juve)$/.test(name)) return "tutto juve";
    if (/^(ansa|ansa it)$/.test(name)) return "ansa";
    if (/^(tgcom24|tgcom 24|mediaset tgcom24)$/.test(name)) return "tgcom24";
    return name;
  }
  function inferGroup(article) {
    const c = classifyArticle(article).categories;
    if (c.includes("Juventus") || c.includes("Sport") || c.includes("Calciomercato")) return "juventus";
    if (c.includes("Politica") || c.includes("Lega")) return "politica";
    if (c.includes("Esteri") || c.includes("Europa")) return "esteri";
    if (c.includes("Sicurezza") || c.includes("Immigrazione")) return "sicurezza";
    return "altro";
  }
  function topicAssignments(articles, history = {}) {
    const assignments = [], unknown = [];
    for (const article of articles) {
      const title = normalize(article.title);
      const definition = definitions.find(d => d[2].test(title) && (!d[4] || d[4].test(title)));
      if (definition) assignments.push({article, id: definition[0], label: definition[1], group: definition[3]});
      else unknown.push({article, tokens: new Set(words(title)), group: inferGroup(article)});
    }
    // New events also emerge automatically: require three distinctive shared words,
    // compatible groups and strong overlap, rather than grouping by a name alone.
    const previousTopics = [...new Map((history.rows || []).filter(r => r.topic.startsWith("event-")).map(r => [r.topic,r])).values()];
    const groups = [];
    for (const item of unknown) {
      const group = groups.find(g => {
        const common = [...item.tokens].filter(t => g.tokens.has(t)).length;
        return g.group === item.group && common >= 3 && common / Math.min(item.tokens.size, g.tokens.size) >= .6;
      });
      if (group) group.items.push(item.article);
      else {
        const prior = previousTopics.find(p => {
          const tokens = new Set(words(p.label));
          const common = [...item.tokens].filter(t => tokens.has(t)).length;
          return p.group === item.group && common >= 3 && common / Math.min(tokens.size,item.tokens.size) >= .6;
        });
        groups.push({...item, items: [item.article], prior});
      }
    }
    for (const group of groups) {
      const tokens = [...group.tokens].sort().slice(0, 8);
      if (tokens.length < 3) continue;
      const label = group.items.map(a => a.title).sort((a,b) => a.length-b.length)[0].replace(/\s*[|].*$/, "").trim();
      const id = group.prior?.topic || "event-" + tokens.join("-");
      const displayLabel = group.prior?.label || (label.length > 90 ? label.slice(0,87).replace(/\s+\S*$/, "") + "…" : label);
      for (const article of group.items) assignments.push({article, id, label:displayLabel, group:group.group});
    }
    return assignments;
  }
  function collectHistory(articles, previous = {}, now = Date.now()) {
    const gap = !previous.collectedAt || now - previous.collectedAt > HOUR;
    const observedSince = gap ? now : previous.observedSince || now;
    const rows = new Map();
    for (const row of previous.rows || []) {
      if (Number.isFinite(row.time) && row.time >= now - 12 * HOUR && row.time <= now) rows.set(row.key, row);
    }
    for (const topic of topicAssignments(articles, previous)) {
      const a = topic.article;
      const own = {source:a.source, originalURL:a.originalURL, link:a.link, pubDate:a.pubDate};
      for (const source of [own, ...(a.sources || [])]) {
        const verified = source.dateSource === "original" && source.originalPubDate;
        const time = Date.parse(verified || source.pubDate || a.pubDate);
        const publisher = publisherKey(source);
        if (!publisher || !Number.isFinite(time) || time > now || time < now - 12 * HOUR) continue;
        const url = source.originalURL || source.link || articleKey(a);
        let hash = 2166136261;
        for (let i=0;i<url.length;i++) hash=Math.imul(hash^url.charCodeAt(i),16777619);
        const key = topic.id + "|" + publisher + "|" + (hash>>>0).toString(36);
        const prior = rows.get(key);
        rows.set(key, {key, topic:topic.id, label:topic.label, group:topic.group, publisher,
          time:prior ? Math.min(prior.time,time) : time});
      }
    }
    return {version:1, observedSince, collectedAt:now, rows:[...rows.values()].sort((a,b) => b.time-a.time).slice(0,6000)};
  }
  function buildTopicTrends(articles, {history = {}, now = Date.now(), limit = 8} = {}) {
    const topics = new Map();
    for (const item of topicAssignments(articles, history)) {
      const time = Date.parse(item.article.pubDate);
      if (!Number.isFinite(time) || time > now || time <= now - 3 * HOUR) continue;
      if (!topics.has(item.id)) topics.set(item.id, {...item, articles:[], publishers:new Set(), latest:0});
      const topic = topics.get(item.id);
      topic.articles.push(item.article);
      topic.latest = Math.max(topic.latest,time);
      for (const source of [{source:item.article.source}, ...(item.article.sources || [])]) {
        const sourceTime = Date.parse(source.dateSource === "original" && source.originalPubDate || source.pubDate || item.article.pubDate);
        const publisher = publisherKey(source);
        if (publisher && sourceTime > now - 3 * HOUR && sourceTime <= now) topic.publishers.add(publisher);
      }
    }
    const ready = Number.isFinite(history.observedSince) && history.observedSince <= now - 6 * HOUR
      && history.collectedAt >= now - HOUR;
    const result = [];
    for (const topic of topics.values()) {
      if (topic.publishers.size < 2) continue;
      const prior = new Set((history.rows || []).filter(r => r.topic === topic.id && r.time > now - 6 * HOUR && r.time <= now - 3 * HOUR).map(r => r.publisher));
      const growing = ready && topic.publishers.size >= Math.max(3, prior.size + 2) && topic.publishers.size >= prior.size * 1.5;
      result.push({id:topic.id, label:topic.label, group:topic.group, articles:topic.articles,
        sourceCount:topic.publishers.size, previousSourceCount:ready ? prior.size : null,
        growing, comparisonReady:ready, latest:topic.latest,
        score:topic.publishers.size * 10 + (growing ? 8 : 0) + (topic.latest - (now - 3 * HOUR)) / HOUR});
    }
    return result.sort((a,b) => b.score-a.score).slice(0,limit);
  }
  root.NewsIntelligence = Object.freeze({version:2, normalize, evidence, isJuventusCoverage, isPoliticalLega,
    hasImmigrationContext, classifyArticle, topicAssignments, publisherKey, collectHistory, buildTopicTrends});
})(globalThis);
