import fs from "node:fs/promises";
import { sanitizeFeedArticle } from "../source-policy.mjs";
import { extractFeedImage } from "../feed-images.mjs";

const VERSION = "V6-RSS-THUMBNAILS";
const OUT = "news.json";
const MAX_ITEMS = 300;
const MIN_GOOD_ITEMS = 100;
const REQUEST_DELAY_MS = 650;
const MAX_RETRIES = 3;

// Query sequenziali con copertura dedicata a sport e mercato generale.
const QUERIES = [
  ["Politica", "politica italiana parlamento maggioranza opposizione when:1d"],
  ["Politica", "partiti italiani parlamento politica when:1d"],
  ["Governo", "governo Meloni consiglio ministri decreto ministeri when:1d"],

  ["Cronaca", "cronaca Italia when:1h"],
  ["Cronaca", "cronaca Italia arrestato aggressione incidente when:1d"],
  ["Sicurezza", "polizia carabinieri arrestato sicurezza Italia when:1d"],

  ["Lega", '"Matteo Salvini" when:1h'],
  ["Lega", '"Matteo Salvini" when:1d'],
  ["Lega", '"Lega" politica when:2d -calcio -serie'],

  ["Immigrazione", "immigrazione migranti Italia when:1h"],
  ["Immigrazione", "immigrazione migranti sbarchi ONG rimpatri Italia when:1d"],
  ["Immigrazione", "Lampedusa migranti sbarchi Italia when:2d"],
  ["Immigrazione", "migranti irregolari CPR rimpatri accoglienza Italia when:2d"],

  ["Crimini & immigrazione", "straniero arrestato Italia when:1d"],
  ["Crimini & immigrazione", "immigrato arrestato Italia when:1d"],
  ["Crimini & immigrazione", "irregolare arrestato Italia when:1d"],
  ["Crimini & immigrazione", "straniero aggressione violenza Italia when:1d"],
  ["Crimini & immigrazione", "straniero rapina furto Italia when:1d"],
  ["Crimini & immigrazione", "immigrato rapina aggressione arrestato Italia when:1d"],
  ["Crimini & immigrazione", "irregolare aggressione rapina Italia when:1d"],

  [
    "Storie umane",
    '"salvato" OR "salvata" OR "soccorso" OR "soccorsa" OR "ritrovato" OR "ritrovata" Italia when:2d'
  ],
  [
    "Storie umane",
    '"fuori pericolo" OR "salva la vita" OR "gesto eroico" Italia when:3d'
  ],

  ["Trasporti", "trasporti infrastrutture ferrovie autostrade Italia when:1d"],
  ["Trasporti", '"Ponte sullo Stretto" Salvini MIT when:2d'],
  ["Europa", '"Unione Europea" Italia Commissione Parlamento Europeo when:1d'],
  ["Esteri", "esteri Europa USA guerra diplomazia when:1d"],

  ["Juventus", "Juventus when:1h"],
  ["Juventus", "Juventus when:1d"],
  ["Calciomercato", "calciomercato when:1h"],
  ["Calciomercato", "calciomercato acquisti cessioni prestiti trattative when:1d"],
  ["Sport", "calcio Serie A when:1h"],
  ["Sport", "tennis Formula 1 MotoGP when:1d"],
  ["Sport", "atletica nuoto basket volley ciclismo when:1d"]
];

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

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

  let out = s;

  for (let i = 0; i < 3; i++) {
    const prev = out;

    out = out
      .replace(
        /&#(\d+);/g,
        (_, n) =>
          String.fromCodePoint(Number(n))
      )
      .replace(
        /&#x([0-9a-f]+);/gi,
        (_, n) =>
          String.fromCodePoint(parseInt(n, 16))
      )
      .replace(
        /&([A-Za-z]+);/g,
        (match, name) =>
          Object.prototype.hasOwnProperty.call(named, name)
            ? named[name]
            : match
      );

    if (out === prev) {
      break;
    }
  }

  return out;
}

function cleanText(t = "") {
  return decodeEntities(
    t
      .replace(
        /<!\[CDATA\[(.*?)\]\]>/gs,
        "$1"
      )
      .replace(
        /<[^>]*>/g,
        ""
      )
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function tag(item, name) {
  const match = item.match(
    new RegExp(
      `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,
      "i"
    )
  );

  return match
    ? cleanText(match[1])
    : "";
}

function normalize(s = "") {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9 ]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

const DEDUP_STOPWORDS = new Set([
  "a",
  "ad",
  "al",
  "alla",
  "alle",
  "allo",
  "ai",
  "agli",
  "anche",
  "che",
  "chi",
  "con",
  "da",
  "dal",
  "dalla",
  "dalle",
  "dei",
  "del",
  "della",
  "delle",
  "di",
  "e",
  "ed",
  "gli",
  "ha",
  "hanno",
  "il",
  "in",
  "la",
  "le",
  "lo",
  "ma",
  "nel",
  "nella",
  "nelle",
  "non",
  "o",
  "per",
  "piu",
  "su",
  "sul",
  "sulla",
  "tra",
  "un",
  "una",
  "uno"
]);

function titleTokens(title = "") {
  return normalize(title)
    .split(" ")
    .filter(
      (token) =>
        token.length >= 3 &&
        !DEDUP_STOPWORDS.has(token)
    );
}

function tokenSet(title = "") {
  return new Set(
    titleTokens(title)
  );
}

function intersectionSize(a, b) {
  let count = 0;

  for (const token of a) {
    if (b.has(token)) {
      count++;
    }
  }

  return count;
}

function jaccardSimilarity(a, b) {
  if (!a.size || !b.size) {
    return 0;
  }

  const intersection =
    intersectionSize(a, b);

  const union =
    a.size +
    b.size -
    intersection;

  return union
    ? intersection / union
    : 0;
}

function containmentSimilarity(a, b) {
  if (!a.size || !b.size) {
    return 0;
  }

  return (
    intersectionSize(a, b) /
    Math.min(a.size, b.size)
  );
}

function significantNumbers(title = "") {
  return new Set(
    (
      normalize(title)
        .match(/\b\d+\b/g)
      ||
      []
    ).filter((number) => {
      const n = Number(number);

      return !(
        n >= 1900 &&
        n <= 2100
      );
    })
  );
}

function conflictingNumbers(titleA, titleB) {
  const a =
    significantNumbers(titleA);

  const b =
    significantNumbers(titleB);

  if (!a.size || !b.size) {
    return false;
  }

  return (
    intersectionSize(a, b) === 0
  );
}

function eventClasses(text = "") {
  const value =
    normalize(text);

  const classes =
    new Set();

  if (
    /\b(morto|morta|morti|morte|decedut|scomparso|scomparsa|addio)\w*/.test(value)
  ) {
    classes.add("death");
  }

  if (
    /\b(arrestat|fermato|fermata|carcere|custodia cautelare)\w*/.test(value)
  ) {
    classes.add("arrest");
  }

  if (
    /\b(rapin|furto|scipp|borseggi)\w*/.test(value)
  ) {
    classes.add("robbery");
  }

  if (
    /\b(aggress|accoltell|picchi|pugni|rissa)\w*/.test(value)
  ) {
    classes.add("assault");
  }

  if (
    /\b(omicid|ucciso|uccisa|uccide|assassin)\w*/.test(value)
  ) {
    classes.add("homicide");
  }

  if (
    /\b(salvat|soccor|ritrovat|fuori pericolo)\w*/.test(value)
  ) {
    classes.add("rescue");
  }

  if (
    /\b(firma|accordo|prestito|cessione|acquisto|ingaggio|trattativa)\w*/.test(value)
  ) {
    classes.add("transfer");
  }

  return classes;
}

function shareEventClass(a, b) {
  return (
    intersectionSize(
      eventClasses(
        `${a.title || ""} ${a.summary || ""}`
      ),
      eventClasses(
        `${b.title || ""} ${b.summary || ""}`
      )
    ) > 0
  );
}

const ENTITY_EXCLUSIONS = new Set([
  "Italia",
  "Italiano",
  "Italiana",
  "Europa",
  "Europea",
  "Europeo",
  "Usa",
  "USA",
  "Ue",
  "UE",
  "Serie",
  "Google",
  "News",
  "Video",
  "Diretta",
  "Ultima"
]);

function entityTokens(title = "") {
  const words =
    title.match(
      /\b[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}\b/g
    )
    ||
    [];

  return new Set(
    words.filter(
      (word) =>
        !ENTITY_EXCLUSIONS.has(word)
    )
  );
}

function shareNamedEntity(a, b) {
  const ea =
    entityTokens(a.title || "");

  const eb =
    entityTokens(b.title || "");

  return (
    ea.size > 0 &&
    eb.size > 0 &&
    intersectionSize(ea, eb) > 0
  );
}

const TRANSFER_ENTITY_EXCLUSIONS = new Set([
  "Juventus", "Juve", "Palermo", "Calcio", "Bianconeri", "Bianconero", "Rosanero", "Rosaneri"
]);

function specificTransferEntities(title = "") {
  return new Set([...entityTokens(title)].filter(entity => !TRANSFER_ENTITY_EXCLUSIONS.has(entity)));
}

function isMultiTopicTransferTitle(title = "") {
  const parts = String(title).split(/(?:[.;]|\s[|–—]\s)\s*/).filter(Boolean);
  if (parts.length < 2) return false;
  const entities = parts.map(specificTransferEntities);
  return entities.some((left, index) => entities.some((right, otherIndex) =>
    otherIndex > index && left.size > 0 && right.size > 0 && intersectionSize(left, right) === 0
  ));
}

function hoursBetween(a, b) {
  const ta =
    new Date(a.pubDate)
      .getTime();

  const tb =
    new Date(b.pubDate)
      .getTime();

  if (
    !Number.isFinite(ta) ||
    !Number.isFinite(tb)
  ) {
    return Infinity;
  }

  return (
    Math.abs(ta - tb) /
    3600000
  );
}

function isDuplicateArticle(a, b) {
  const titleA =
    normalize(a.title || "");

  const titleB =
    normalize(b.title || "");

  if (!titleA || !titleB) {
    return false;
  }

  if (titleA === titleB) {
    return true;
  }

  const ageDifference =
    hoursBetween(a, b);

  if (ageDifference > 36) {
    return false;
  }

  if (
    conflictingNumbers(
      a.title,
      b.title
    )
  ) {
    return false;
  }

  const tokensA =
    tokenSet(a.title);

  const tokensB =
    tokenSet(b.title);

  const shared =
    intersectionSize(
      tokensA,
      tokensB
    );

  const jaccard =
    jaccardSimilarity(
      tokensA,
      tokensB
    );

  const containment =
    containmentSimilarity(
      tokensA,
      tokensB
    );

  if (
    shared >= 4 &&
    jaccard >= 0.58 &&
    containment >= 0.72
  ) {
    return true;
  }

  if (
    shared >= 5 &&
    containment >= 0.82
  ) {
    return true;
  }

  // Modalità prudente:
  // stessa entità + stesso tipo di evento + massimo 18 ore.
  if (
    ageDifference <= 18 &&
    shareNamedEntity(a, b) &&
    shareEventClass(a, b)
  ) {
    const aEvents = eventClasses(`${a.title || ""} ${a.summary || ""}`);
    const bEvents = eventClasses(`${b.title || ""} ${b.summary || ""}`);
    const transferPair = aEvents.has("transfer") && bEvents.has("transfer");
    if (transferPair && (isMultiTopicTransferTitle(a.title) || isMultiTopicTransferTitle(b.title))) return false;
    return true;
  }

  return false;
}

function sourceFromTitle(title = "") {
  const parts =
    title.split(" - ");

  return parts.length > 1
    ? parts.pop().trim()
    : "Google News";
}

function stripSource(title, source) {
  const suffix =
    ` - ${source}`;

  return title.endsWith(suffix)
    ? title
        .slice(
          0,
          -suffix.length
        )
        .trim()
    : title;
}

function googleUrl(query) {
  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=it&gl=IT&ceid=IT:it"
  );
}

function parseGoogle(xml, category) {
  const items =
    xml.match(
      /<item>[\s\S]*?<\/item>/gi
    )
    ||
    [];

  return items
    .slice(0, 25)
    .map((item) => {
      const rawTitle =
        tag(item, "title");

      const rssSource =
        tag(item, "source");

      const source =
        rssSource &&
        rssSource !== "Google News"
          ? rssSource
          : sourceFromTitle(rawTitle);

      const title =
        stripSource(
          rawTitle,
          source
        );

      const pubDate =
        tag(item, "pubDate");

      const link =
        tag(item, "link");

      const summary =
        tag(item, "description");

      const image =
        extractFeedImage(item);

      if (
        !title ||
        !link ||
        !pubDate
      ) {
        return null;
      }

      return {
        title,
        summary,
        link,
        image,
        source,

        category,

        categories: [
          category
        ],

        pubDate,

        googlePubDate:
          pubDate,

        originalPubDate:
          null,

        dateSource:
          "google",

        isVideo:
          /\b(video|filmato|filmati|telecamere|ripreso|ripresa|riprese)\b/i.test(
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

async function fetchOne(category, query) {
  let lastStatus = 0;

  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      const response =
        await fetch(
          googleUrl(query),
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; AgostinoNewsFeed/5.0)",

              "Accept":
                "application/rss+xml, application/xml, text/xml, */*",

              "Accept-Language":
                "it-IT,it;q=0.9,en;q=0.7"
            }
          }
        );

      lastStatus =
        response.status;

      const text =
        await response.text();

      if (
        response.ok &&
        text.includes("<item>")
      ) {
        return {
          ok: true,

          status:
            response.status,

          category,

          query,

          news:
            parseGoogle(
              text,
              category
            )
        };
      }

      if (
        ![
          429,
          500,
          502,
          503,
          504
        ].includes(
          response.status
        )
      ) {
        break;
      }
    } catch (error) {
      console.error(
        "Fetch error:",
        query,
        error
      );
    }

    await sleep(
      1200 *
      attempt
    );
  }

  return {
    ok: false,

    status:
      lastStatus,

    category,

    query,

    news: []
  };
}

function mergeSourceLists(target, incoming) {
  for (
    const source
    of incoming.sources || []
  ) {
    const exists =
      target.sources.some(
        (current) =>
          current.source === source.source &&
          current.link === source.link
      );

    if (!exists) {
      target.sources.push(source);
    }
  }
}

function mergeCategoryLists(target, incoming) {
  for (
    const category
    of incoming.categories ||
    [
      incoming.category
    ]
  ) {
    if (
      category &&
      !target.categories.includes(category)
    ) {
      target.categories.push(category);
    }
  }
}

function merge(items) {
  const merged = [];

  const ordered =
    [...items].sort(
      (a, b) =>
        new Date(b.pubDate) -
        new Date(a.pubDate)
    );

  for (
    const article
    of ordered
  ) {
    const duplicate =
      merged.find(
        (existing) =>
          isDuplicateArticle(
            existing,
            article
          )
      );

    if (!duplicate) {
      merged.push({
        ...article,

        categories: [
          ...(
            article.categories ||
            [
              article.category
            ]
          )
        ],

        sources: [
          ...(
            article.sources ||
            []
          )
        ]
      });

      continue;
    }

    mergeCategoryLists(
      duplicate,
      article
    );

    mergeSourceLists(
      duplicate,
      article
    );

    if (
      (
        article.summary ||
        ""
      ).length >
      (
        duplicate.summary ||
        ""
      ).length
    ) {
      duplicate.summary =
        article.summary;
    }

    duplicate.isVideo =
      Boolean(
        duplicate.isVideo ||
        article.isVideo
      );

    if (
      !duplicate.image &&
      article.image
    ) {
      duplicate.image =
        article.image;
    }
  }

  return merged;
}

function removeCategory(categories, category) {
  const index =
    categories.indexOf(category);

  if (index !== -1) {
    categories.splice(
      index,
      1
    );
  }
}

function moveCategoryFirst(categories, category) {
  removeCategory(
    categories,
    category
  );

  categories.unshift(category);
}

function finalClassify(article) {
  const text =
    normalize(
      `${article.title || ""} ${article.summary || ""}`
    );

  const categories = [
    ...(
      article.categories ||
      [
        article.category
      ]
    ).filter(Boolean)
  ];

  const add =
    (category) => {
      if (
        category &&
        !categories.includes(category)
      ) {
        categories.push(category);
      }
    };

  const hasLega =
    /\bsalvini\b/.test(text)
    ||
    (
      /\blega\b/.test(text)
      &&
      /\b(partit|politic|fontana|zaia|fedriga|giorgetti|calderoli|molinar|romeo|borghi|rinaldi|vannacci)\w*/.test(text)
    );

  const immigration =
    /\b(immigrat|migrant|stranier|irregolar|clandestin|extracomunitar|richiedent asil|profugh|sbarch|sbarco|rimpatr|cpr|accoglienz|lampedusa|ong|hotspot|barcone)\w*/.test(text);

  const crime =
    /\b(arrest|rapin|aggress|omicid|tentato omicidio|furto|violenz|stupro|stupr|molest|accoltell|coltell|pugni|picchi|rissa|spaccio|droga|evas|fuga|poliziott|carabinier|agente|denunciat|fermato|minacc|sequestr|scipp|borseggi)\w*/.test(text);

  const government =
    /\b(governo|meloni|palazzo chigi|consiglio ministri|ministro|ministra|ministero|decreto legge|decreto legislativo)\b/.test(text);

  const politics =
    government
    ||
    /\b(parlament|senato|camera deputat|maggioranza|opposizione|partit|elezion|coalizion|segretari|presidente regione)\w*/.test(text)
    ||
    hasLega;

  const juventus =
    /\b(juventus|juve|bianconer)\w*/.test(text);

  const market =
    /\bcalciomercato\b/.test(text)
    || (
      /\b(acquist|cession|prestito|trattativ|offerta|accordo|firma|ingaggio|riscatto|parametro zero|trasferiment|entourage|procurator|obiettivo di mercato)\w*/.test(text)
      && /\b(calcio|calciator|allenator|portier|difensor|centrocampist|attaccant|juventus|juve|milan|inter|napoli|roma|lazio|atalanta|bologna|cagliari|como|cremonese|fiorentina|genoa|lecce|palermo|parma|pisa|sassuolo|torino|udinese|venezia|verona|serie a)\b/.test(text)
    );

  const sport =
    /\b(calcio|serie [abc]|champions league|europa league|conference league|fifa|uefa|tennis|us open|wimbledon|roland garros|coppa davis|atp|wta|formula 1|formula uno|gran premio|motogp|moto gp|atletica|nuoto|basket|pallacanestro|volley|pallavolo|ciclismo|rugby|sci|mondiali|olimpiad|paralimpiad)\w*/.test(text)
    || /\b(sinner|sabalenka|federer|alcaraz|djokovic|musetti|berrettini|leclerc|verstappen|hamilton|antonelli|spalletti)\b/.test(text);

  const humanPositive =
    /\b(salvat|soccors|ritrovat|messo in salvo|fuori pericolo|salva la vita|salvano la vita|gesto eroico|eroe|solidariet|abbraccio|lieto fine|adottat)\w*/.test(text)
    &&
    !/\b(morto|morta|morti|morte|cadavere|ucciso|uccisa|omicidio|strage)\b/.test(text);

  const transport =
    /\b(trasport|treno|ferrovi|autostrad|ponte sullo stretto|infrastruttur|aeroport|porto|metropolitana|metro|tav)\w*/.test(text);

  const europe =
    /\b(unione europea|commissione europea|parlamento europeo|bruxelles|consiglio europeo|ue)\b/.test(text);

  if (hasLega) {
    add("Lega");
  } else {
    removeCategory(
      categories,
      "Lega"
    );
  }

  if (immigration) {
    add("Immigrazione");
  } else {
    removeCategory(
      categories,
      "Immigrazione"
    );
  }

  if (
    immigration &&
    crime
  ) {
    add(
      "Crimini & immigrazione"
    );
  } else {
    removeCategory(
      categories,
      "Crimini & immigrazione"
    );
  }

  if (crime) {
    add("Sicurezza");
  }

  if (government) {
    add("Governo");
  }

  if (politics) {
    add("Politica");
  }

  if (juventus) {
    add("Juventus");
  } else {
    removeCategory(
      categories,
      "Juventus"
    );
  }

  if (market) {
    add("Calciomercato");
    removeCategory(categories, "Sport");
  } else {
    removeCategory(
      categories,
      "Calciomercato"
    );
    if (sport) add("Sport");
    else removeCategory(categories, "Sport");
  }

  if (humanPositive) {
    add("Storie umane");
  } else {
    removeCategory(
      categories,
      "Storie umane"
    );
  }

  if (transport) {
    add("Trasporti");
  }

  if (europe) {
    add("Europa");
  }

  if (
    immigration &&
    crime
  ) {
    moveCategoryFirst(
      categories,
      "Crimini & immigrazione"
    );
  } else if (hasLega) {
    moveCategoryFirst(
      categories,
      "Lega"
    );
  } else if (market) {
    moveCategoryFirst(
      categories,
      "Calciomercato"
    );
  } else if (juventus) {
    moveCategoryFirst(
      categories,
      "Juventus"
    );
  } else if (sport) {
    moveCategoryFirst(categories, "Sport");
  } else if (humanPositive) {
    moveCategoryFirst(
      categories,
      "Storie umane"
    );
  }

  if (!categories.length) {
    categories.push("Cronaca");
  }

  return {
    ...article,

    category:
      categories[0],

    categories
  };
}

async function readPrevious() {
  try {
    const raw =
      await fs.readFile(
        OUT,
        "utf8"
      );

    const parsed =
      JSON.parse(raw);

    return Array.isArray(
      parsed.news
    )
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(
    `Starting ${VERSION}`
  );

  console.log(
    `Total queries: ${QUERIES.length}`
  );

  const previous =
    await readPrevious();

  const results = [];

  for (
    let i = 0;
    i < QUERIES.length;
    i++
  ) {
    const [
      category,
      query
    ] =
      QUERIES[i];

    const result =
      await fetchOne(
        category,
        query
      );

    results.push(result);

    console.log(
      `[${i + 1}/${QUERIES.length}] ` +
      `${category}: ` +
      `${result.ok ? "OK" : "FAIL"} ` +
      `status=${result.status} ` +
      `items=${result.news.length}`
    );

    if (
      i <
      QUERIES.length - 1
    ) {
      await sleep(
        REQUEST_DELAY_MS
      );
    }
  }

  const successful =
    results.filter(
      (result) =>
        result.ok
    );

  const errors = {};

  for (
    const result
    of results.filter(
      (result) =>
        !result.ok
    )
  ) {
    const key =
      String(
        result.status ||
        0
      );

    errors[key] =
      (
        errors[key] ||
        0
      ) + 1;
  }

  const rawGoogleItems =
    successful.flatMap(
      (result) =>
        result.news
    )
      .map(sanitizeFeedArticle)
      .filter(Boolean);

  const mergedItems =
    merge(
      rawGoogleItems
    );

  console.log(
    `Dedup: ${rawGoogleItems.length} raw -> ${mergedItems.length} unique`
  );

  const news =
    mergedItems
      .map(finalClassify)
      .map(sanitizeFeedArticle)
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b.pubDate) -
          new Date(a.pubDate)
      )
      .slice(
        0,
        MAX_ITEMS
      )
      .map(
        (
          article,
          index
        ) => ({
          ...article,

          id:
            `${normalize(article.title).slice(0, 70)}-` +
            `${new Date(article.pubDate).getTime()}-` +
            `${index}`,

          sourceCount:
            article.sources?.length ||
            1
        })
      );

  if (
    news.length <
      MIN_GOOD_ITEMS &&
    previous?.news?.length >=
      MIN_GOOD_ITEMS
  ) {
    console.log(
      `New feed too small (${news.length}). ` +
      `Keeping previous good feed (${previous.news.length}).`
    );

    const previousNews = previous.news
      .map(sanitizeFeedArticle)
      .filter(Boolean)
      .slice(0, MAX_ITEMS);

    const payload = {
      ...previous,

      version:
        VERSION,

      lastAttempt:
        new Date()
          .toISOString(),

      refreshOk:
        false,

      successfulQueries:
        successful.length,

      totalQueries:
        QUERIES.length,

      errors,

      servedPreviousGood:
        true,

      total:
        previousNews.length,

      news:
        previousNews
    };

    await fs.writeFile(
      OUT,

      JSON.stringify(
        payload,
        null,
        2
      ) + "\n",

      "utf8"
    );

    return;
  }

  const payload = {
    success: true,

    version:
      VERSION,

    engine:
      "github-actions-google-news-v5-dedup-safe",

    updatedAt:
      new Date()
        .toISOString(),

    lastAttempt:
      new Date()
        .toISOString(),

    refreshOk:
      news.length >=
      MIN_GOOD_ITEMS,

    successfulQueries:
      successful.length,

    totalQueries:
      QUERIES.length,

    errors,

    servedPreviousGood:
      false,

    rawTotal:
      rawGoogleItems.length,

    deduplicatedTotal:
      mergedItems.length,

    total:
      news.length,

    news
  };

  await fs.writeFile(
    OUT,

    JSON.stringify(
      payload,
      null,
      2
    ) + "\n",

    "utf8"
  );

  console.log(
    `Saved ${news.length} news to ${OUT}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
