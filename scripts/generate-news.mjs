import fs from "node:fs/promises";

const VERSION = "V4-CATEGORIES-SAFE";
const OUT = "news.json";
const MAX_ITEMS = 300;
const MIN_GOOD_ITEMS = 100;
const REQUEST_DELAY_MS = 650;
const MAX_RETRIES = 3;

/*
  ARCHITETTURA INVARIATA:
  - Google News viene recuperato esclusivamente da GitHub Actions.
  - Cloudflare continua a leggere news.json come prima.
  - Restano esattamente 30 query.
*/
const QUERIES = [
  // POLITICA / GOVERNO
  [
    "Politica",
    "politica italiana parlamento maggioranza opposizione when:1d"
  ],
  [
    "Politica",
    "partiti italiani parlamento politica when:1d"
  ],
  [
    "Governo",
    "governo Meloni consiglio ministri decreto ministeri when:1d"
  ],

  // CRONACA / SICUREZZA
  [
    "Cronaca",
    "cronaca Italia when:1h"
  ],
  [
    "Cronaca",
    "cronaca Italia arrestato aggressione incidente when:1d"
  ],
  [
    "Sicurezza",
    "polizia carabinieri arrestato sicurezza Italia when:1d"
  ],

  // SALVINI / LEGA
  [
    "Lega",
    "\"Matteo Salvini\" when:1h"
  ],
  [
    "Lega",
    "\"Matteo Salvini\" when:1d"
  ],
  [
    "Lega",
    "\"Lega\" politica when:2d -calcio -serie"
  ],

  // IMMIGRAZIONE
  [
    "Immigrazione",
    "immigrazione migranti Italia when:1h"
  ],
  [
    "Immigrazione",
    "immigrazione migranti sbarchi ONG rimpatri Italia when:1d"
  ],
  [
    "Immigrazione",
    "Lampedusa migranti sbarchi Italia when:2d"
  ],
  [
    "Immigrazione",
    "migranti irregolari CPR rimpatri accoglienza Italia when:2d"
  ],

  // CRIMINI & IMMIGRAZIONE
  [
    "Crimini & immigrazione",
    "straniero arrestato Italia when:1d"
  ],
  [
    "Crimini & immigrazione",
    "immigrato arrestato Italia when:1d"
  ],
  [
    "Crimini & immigrazione",
    "irregolare arrestato Italia when:1d"
  ],
  [
    "Crimini & immigrazione",
    "straniero aggressione violenza Italia when:1d"
  ],
  [
    "Crimini & immigrazione",
    "straniero rapina furto Italia when:1d"
  ],
  [
    "Crimini & immigrazione",
    "immigrato rapina aggressione arrestato Italia when:1d"
  ],
  [
    "Crimini & immigrazione",
    "irregolare aggressione rapina Italia when:1d"
  ],

  // STORIE UMANE POSITIVE
  [
    "Storie umane",
    "\"salvato\" OR \"salvata\" OR \"soccorso\" OR \"soccorsa\" OR \"ritrovato\" OR \"ritrovata\" Italia when:2d"
  ],
  [
    "Storie umane",
    "\"fuori pericolo\" OR \"salva la vita\" OR \"gesto eroico\" Italia when:3d"
  ],

  // TRASPORTI / EUROPA / ESTERI
  [
    "Trasporti",
    "trasporti infrastrutture ferrovie autostrade Italia when:1d"
  ],
  [
    "Trasporti",
    "\"Ponte sullo Stretto\" Salvini MIT when:2d"
  ],
  [
    "Europa",
    "\"Unione Europea\" Italia Commissione Parlamento Europeo when:1d"
  ],
  [
    "Esteri",
    "esteri Europa USA guerra diplomazia when:1d"
  ],

  // JUVENTUS / CALCIOMERCATO
  [
    "Juventus",
    "Juventus when:1h"
  ],
  [
    "Juventus",
    "Juventus when:1d"
  ],
  [
    "Calciomercato",
    "calciomercato Juventus when:1h"
  ],
  [
    "Calciomercato",
    "Juventus acquisti cessioni prestito trattativa when:1d"
  ]
];

const sleep = ms =>
  new Promise(resolve =>
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
          String.fromCodePoint(
            Number(n)
          )
      )
      .replace(
        /&#x([0-9a-f]+);/gi,
        (_, n) =>
          String.fromCodePoint(
            parseInt(n, 16)
          )
      )
      .replace(
        /&([A-Za-z]+);/g,
        (match, name) =>
          Object.prototype.hasOwnProperty.call(
            named,
            name
          )
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

function sourceFromTitle(
  title = ""
) {
  const parts =
    title.split(" - ");

  return parts.length > 1
    ? parts.pop().trim()
    : "Google News";
}

function stripSource(
  title,
  source
) {
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

function parseGoogle(
  xml,
  category
) {
  const items =
    xml.match(
      /<item>[\s\S]*?<\/item>/gi
    ) || [];

  return items
    .slice(
      0,
      25
    )
    .map(item => {
      const rawTitle =
        tag(
          item,
          "title"
        );

      const rssSource =
        tag(
          item,
          "source"
        );

      const source =
        rssSource &&
        rssSource !==
          "Google News"
          ? rssSource
          : sourceFromTitle(
              rawTitle
            );

      const title =
        stripSource(
          rawTitle,
          source
        );

      const pubDate =
        tag(
          item,
          "pubDate"
        );

      const link =
        tag(
          item,
          "link"
        );

      const summary =
        tag(
          item,
          "description"
        );

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

async function fetchOne(
  category,
  query
) {
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
                "Mozilla/5.0 (compatible; AgostinoNewsFeed/4.0)",

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
        text.includes(
          "<item>"
        )
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

function merge(items) {
  const map =
    new Map();

  for (
    const article
    of items
  ) {
    const key =
      normalize(
        article.title
      );

    if (!key) {
      continue;
    }

    if (
      !map.has(key)
    ) {
      map.set(
        key,
        {
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
        }
      );

      continue;
    }

    const existing =
      map.get(key);

    for (
      const category
      of article.categories ||
      [
        article.category
      ]
    ) {
      if (
        category &&
        !existing.categories.includes(
          category
        )
      ) {
        existing.categories.push(
          category
        );
      }
    }

    for (
      const source
      of article.sources ||
      []
    ) {
      const alreadyExists =
        existing.sources.some(
          current =>
            current.source ===
              source.source &&
            current.link ===
              source.link
        );

      if (
        !alreadyExists
      ) {
        existing.sources.push(
          source
        );
      }
    }
  }

  return [
    ...map.values()
  ];
}

function removeCategory(
  categories,
  category
) {
  const index =
    categories.indexOf(
      category
    );

  if (
    index !== -1
  ) {
    categories.splice(
      index,
      1
    );
  }
}

function moveCategoryFirst(
  categories,
  category
) {
  removeCategory(
    categories,
    category
  );

  categories.unshift(
    category
  );
}

function finalClassify(
  article
) {
  const text =
    normalize(
      `${
        article.title ||
        ""
      } ${
        article.summary ||
        ""
      }`
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
    category => {
      if (
        category &&
        !categories.includes(
          category
        )
      ) {
        categories.push(
          category
        );
      }
    };

  /*
   * SALVINI / LEGA
   *
   * "Lega" da sola non basta:
   * evitiamo Lega Serie A, leghe sportive ecc.
   */
  const hasLega =
    /\bsalvini\b/.test(
      text
    )
    ||
    (
      /\blega\b/.test(
        text
      )
      &&
      /\b(partit|politic|fontana|zaia|fedriga|giorgetti|calderoli|molinar|romeo|borghi|rinaldi|vannacci)\w*/.test(
        text
      )
    );

  /*
   * IMMIGRAZIONE
   */
  const immigration =
    /\b(immigrat|migrant|stranier|irregolar|clandestin|extracomunitar|richiedent asil|profugh|sbarch|sbarco|rimpatr|cpr|accoglienz|lampedusa|ong|hotspot|barcone)\w*/.test(
      text
    );

  /*
   * CRIMINALITÀ / SICUREZZA
   */
  const crime =
    /\b(arrest|rapin|aggress|omicid|tentato omicidio|furto|violenz|stupro|stupr|molest|accoltell|coltell|pugni|picchi|rissa|spaccio|droga|evas|fuga|poliziott|carabinier|agente|denunciat|fermato|minacc|sequestr|scipp|borseggi)\w*/.test(
      text
    );

  /*
   * GOVERNO
   */
  const government =
    /\b(governo|meloni|palazzo chigi|consiglio ministri|ministro|ministra|ministero|decreto legge|decreto legislativo)\b/.test(
      text
    );

  /*
   * POLITICA
   */
  const politics =
    government
    ||
    /\b(parlament|senato|camera deputat|maggioranza|opposizione|partit|elezion|coalizion|segretari|presidente regione)\w*/.test(
      text
    )
    ||
    hasLega;

  /*
   * JUVENTUS
   */
  const juventus =
    /\b(juventus|juve|bianconer)\w*/.test(
      text
    );

  /*
   * CALCIOMERCATO
   */
  const market =
    /\b(calciomercato|mercato|acquist|cession|prestito|trattativa|offerta|accordo|firma|ingaggio)\w*/.test(
      text
    )
    &&
    /\b(calcio|juventus|juve|milan|inter|napoli|roma|lazio|atalanta|serie a)\b/.test(
      text
    );

  /*
   * STORIE UMANE:
   * puntiamo alle storie positive / lieto fine.
   */
  const humanPositive =
    /\b(salvat|soccors|ritrovat|messo in salvo|fuori pericolo|salva la vita|salvano la vita|gesto eroico|eroe|solidariet|abbraccio|lieto fine|adottat)\w*/.test(
      text
    )
    &&
    !/\b(morto|morta|morti|morte|cadavere|ucciso|uccisa|omicidio|strage)\b/.test(
      text
    );

  /*
   * TRASPORTI
   */
  const transport =
    /\b(trasport|treno|ferrovi|autostrad|ponte sullo stretto|infrastruttur|aeroport|porto|metropolitana|metro|tav)\w*/.test(
      text
    );

  /*
   * EUROPA
   */
  const europe =
    /\b(unione europea|commissione europea|parlamento europeo|bruxelles|consiglio europeo|ue)\b/.test(
      text
    );

  /*
   * LEGA:
   * se Google ha restituito un risultato non politico
   * sotto la query Lega, togliamo il falso positivo.
   */
  if (
    hasLega
  ) {
    add(
      "Lega"
    );
  } else if (
    categories.includes(
      "Lega"
    )
  ) {
    removeCategory(
      categories,
      "Lega"
    );
  }

  /*
   * IMMIGRAZIONE:
   * deve esserci almeno un segnale reale.
   */
  if (
    immigration
  ) {
    add(
      "Immigrazione"
    );
  } else if (
    categories.includes(
      "Immigrazione"
    )
  ) {
    removeCategory(
      categories,
      "Immigrazione"
    );
  }

  /*
   * CRIMINI & IMMIGRAZIONE:
   * servono ENTRAMBI i segnali.
   */
  if (
    immigration &&
    crime
  ) {
    add(
      "Crimini & immigrazione"
    );
  } else if (
    categories.includes(
      "Crimini & immigrazione"
    )
  ) {
    removeCategory(
      categories,
      "Crimini & immigrazione"
    );
  }

  if (
    crime
  ) {
    add(
      "Sicurezza"
    );
  }

  if (
    government
  ) {
    add(
      "Governo"
    );
  }

  if (
    politics
  ) {
    add(
      "Politica"
    );
  }

  /*
   * JUVENTUS:
   * eliminiamo eventuali risultati sportivi
   * non realmente riferiti alla Juve.
   */
  if (
    juventus
  ) {
    add(
      "Juventus"
    );
  } else if (
    categories.includes(
      "Juventus"
    )
  ) {
    removeCategory(
      categories,
      "Juventus"
    );
  }

  /*
   * CALCIOMERCATO:
   * deve esserci un vero segnale di mercato.
   */
  if (
    market
  ) {
    add(
      "Calciomercato"
    );
  } else if (
    categories.includes(
      "Calciomercato"
    )
  ) {
    removeCategory(
      categories,
      "Calciomercato"
    );
  }

  /*
   * STORIE UMANE:
   * evitiamo tragedie classificate come
   * storie positive solo perché compare "soccorso".
   */
  if (
    humanPositive
  ) {
    add(
      "Storie umane"
    );
  } else if (
    categories.includes(
      "Storie umane"
    )
  ) {
    removeCategory(
      categories,
      "Storie umane"
    );
  }

  if (
    transport
  ) {
    add(
      "Trasporti"
    );
  }

  if (
    europe
  ) {
    add(
      "Europa"
    );
  }

  /*
   * ORDINE DEL BADGE PRINCIPALE
   *
   * Quando sei su "Tutte", vogliamo mostrare
   * la categoria più utile e specifica.
   */
  if (
    immigration &&
    crime
  ) {
    moveCategoryFirst(
      categories,
      "Crimini & immigrazione"
    );
  } else if (
    hasLega
  ) {
    moveCategoryFirst(
      categories,
      "Lega"
    );
  } else if (
    market
  ) {
    moveCategoryFirst(
      categories,
      "Calciomercato"
    );
  } else if (
    juventus
  ) {
    moveCategoryFirst(
      categories,
      "Juventus"
    );
  } else if (
    humanPositive
  ) {
    moveCategoryFirst(
      categories,
      "Storie umane"
    );
  }

  if (
    !categories.length
  ) {
    categories.push(
      "Cronaca"
    );
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
      JSON.parse(
        raw
      );

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

  /*
   * Le richieste restano sequenziali:
   * non cambiamo il comportamento che
   * sta funzionando bene con Google.
   */
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

    results.push(
      result
    );

    console.log(
      `[${i + 1}/${QUERIES.length}] ` +
      `${category}: ` +
      `${result.ok ? "OK" : "FAIL"} ` +
      `status=${result.status} ` +
      `items=${result.news.length}`
    );

    if (
      i <
      QUERIES.length -
        1
    ) {
      await sleep(
        REQUEST_DELAY_MS
      );
    }
  }

  const successful =
    results.filter(
      result =>
        result.ok
    );

  const errors = {};

  for (
    const result
    of results.filter(
      result =>
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

  const news =
    merge(
      successful.flatMap(
        result =>
          result.news
      )
    )
      .map(
        finalClassify
      )
      .sort(
        (a, b) =>
          new Date(
            b.pubDate
          )
          -
          new Date(
            a.pubDate
          )
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
            `${normalize(
              article.title
            ).slice(
              0,
              70
            )}-` +
            `${new Date(
              article.pubDate
            ).getTime()}-` +
            `${index}`,

          sourceCount:
            article.sources
              ?.length ||
            1
        })
      );

  /*
   * Protezione LAST GOOD invariata:
   * se Google restituisce troppo poco,
   * non distruggiamo un feed sano.
   */
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
        true
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
      "github-actions-google-news-v4-categories-safe",

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
  .catch(error => {
    console.error(
      error
    );

    process.exit(1);
  });
