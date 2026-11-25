// Pure shared function: also embedded in the dashboard for cached/older feeds.
export function clusterRelatedNews(items) {
  const normalize = value => String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const stop = new Set('della delle degli dello che con per una uno nel nella nelle alla alle dagli dalle sono come dopo prima tra fra sul sulla sulle dai dal del dei il lo la gli le un di da a e o in su al ai si ha hanno essere contro piu non news italia italiano italiana italiani italiane'.split(' '));
  const tokens = title => new Set(normalize(title).split(' ').filter(word => word.length >= 3 && !stop.has(word) && !/^\d+$/.test(word)));
  const overlap = (a, b) => [...a].filter(value => b.has(value)).length;
  const time = article => Date.parse(article.dateSource === 'original' && article.originalPubDate ? article.originalPubDate : article.pubDate);
  const urlKey = value => {
    try {
      const url = new URL(value); url.hash = '';
      if (url.pathname === '/') return '';
      for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_') || key === 'oc') url.searchParams.delete(key);
      return url.href;
    } catch { return ''; }
  };
  const publisher = source => {
    const name = normalize(source.source || source.name);
    if (/^(corriere della sera|corriere roma|corriere milano|corriere it)$/.test(name)) return 'corriere.it';
    for (const value of [source.originalURL, source.link, source.sourceHomepage]) {
      try {
        const host = new URL(value).hostname.replace(/^www\./, '');
        if (host !== 'news.google.com') return host.split('.').slice(-2).join('.');
      } catch {}
    }
    return name || urlKey(source.originalURL || source.link);
  };
  const articleSources = article => {
    const own = {source: article.source, link: article.link, originalURL: article.originalURL,
      sourceHomepage: article.sourceHomepage, pubDate: article.pubDate,
      originalPubDate: article.originalPubDate, dateSource: article.dateSource, image: article.image};
    const sources = [...(article.sources || [])];
    if (!sources.some(source => normalize(source.source) === normalize(article.source))) sources.unshift(own);
    return sources.length ? sources : [own];
  };
  const cleanSources = sources => {
    const distinct = new Map();
    const resolved = source => {
      try { return new URL(source.originalURL || source.link).hostname !== 'news.google.com'; } catch { return false; }
    };
    for (const source of sources) {
      const key = publisher(source); if (!key) continue;
      const previous = distinct.get(key);
      if (!previous || (!resolved(previous) && resolved(source))) distinct.set(key, {...source});
    }
    return [...distinct.values()];
  };
  const politicalBots = title => (/\bbots?\b/.test(title) || /\bnon posso\b.{0,50}\binsultar\w*\b/.test(title))
    && /\b(salvini|fidanza|nardella|lega|fdi|pd|politic\w*)\b/.test(title)
    && /\b(social|post|comment\w*|account|partit\w*|politic\w*|lega)\b/.test(title);
  const asylumProposals = title => /\btavolo asilo\b/.test(title) && /\b(?:10|dieci) proposte\b/.test(title);
  const metadata = new WeakMap();
  const meta = article => {
    if (!metadata.has(article)) {
      const title = normalize(article.title);
      metadata.set(article, {title, time: time(article), tokens: tokens(title),
        urls: new Set(articleSources(article).map(source => urlKey(source.originalURL || source.link)).filter(Boolean)),
        numbers: new Set((title.match(/\b\d+\b/g) || []).filter(n => Number(n) < 1900 || Number(n) > 2100)),
        bots: politicalBots(title), asylumProposals: asylumProposals(title)});
    }
    return metadata.get(article);
  };
  const sameStory = (a, b) => {
    const am = meta(a), bm = meta(b);
    const left = am.title, right = bm.title;
    if (!left || !right) return false;
    const age = Math.abs(am.time - bm.time);
    if (!Number.isFinite(age) || age > 36 * 3600000) return false;
    if (overlap(am.urls, bm.urls)) return true;
    if (left === right) return true;
    // This event has sharply different headlines; require bots AND political/social context.
    if (age <= 12 * 3600000 && am.bots && bm.bots) return true;
    const leftNumbers = am.numbers, rightNumbers = bm.numbers;
    if (leftNumbers.size && rightNumbers.size && !overlap(leftNumbers, rightNumbers)) return false;
    if (am.asylumProposals && bm.asylumProposals) return true;
    const l = am.tokens, r = bm.tokens, common = overlap(l, r);
    return common >= 4 && common / Math.min(l.size, r.size) >= .7 && common / (l.size + r.size - common) >= .48;
  };
  const groups = [];
  const ordered = (Array.isArray(items) ? items : []).filter(item => item && item.title)
    .slice().sort((a, b) => time(b) - time(a));
  for (const article of ordered) {
    const group = groups.find(group => group.members.some(member => sameStory(member, article)));
    if (!group) {
      const sources = cleanSources(articleSources(article));
      groups.push({members: [article], article: {...article, storyTitles: [...new Set([article.title, ...(article.storyTitles || [])])], sources, sourceCount: Math.max(1, sources.length)}});
      continue;
    }
    group.members.push(article);
    const primary = group.article;
    primary.storyTitles = [...new Set([...primary.storyTitles, article.title, ...(article.storyTitles || [])])];
    primary.sources = cleanSources([...primary.sources, ...articleSources(article)]);
    primary.sourceCount = primary.sources.length;
    primary.categories = [...new Set([...(primary.categories || [primary.category]), ...(article.categories || [article.category])].filter(Boolean))];
    primary.isVideo = Boolean(primary.isVideo || article.isVideo);
    if (!primary.image && article.image) primary.image = article.image;
  }
  return groups.map(group => group.article);
}
