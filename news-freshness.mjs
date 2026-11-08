// Pure function, also sent to the browser to validate restored local news.
export function normalizeNewsFreshness(article, now = Date.now()) {
  if (!article || !article.title) return null;
  const validTime = value => value ? Date.parse(value) : NaN;
  const original = validTime(article.originalPubDate);
  const verified = article.dateSource === 'original' && Number.isFinite(original);
  const pubDate = verified ? article.originalPubDate : article.pubDate;
  const published = validTime(pubDate);
  if (!Number.isFinite(published) || published > now + 10 * 60000) return null;
  const title = String(article.title).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Only prospective announcements with an explicit calendar date expire.
  // Reports, anniversaries and new cancellations must remain available.
  const report = /\b(inaugurat[oaie]|si e svolt[oa]|si sono svolt[ie]|annullat[oaie]|rinviat[oaie]|posticipat[oaie]|anniversario|accadde|ieri|bilancio)\b/;
  const advance = /\b(ci sara|si terra|si terranno|inaugurera|inaugureranno|in programma|appuntamento|confermat[oaie]|previst[oaie])\b|\binaugurazione\s+(?:di|del|per|il)\b/;
  if (advance.test(title) && !report.test(title)) {
    const months = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
    const dayKey = value => {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value).map(x => [x.type,x.value]));
      return Number(p.year) * 10000 + Number(p.month) * 100 + Number(p.day);
    };
    const today = dayKey(now);
    const currentYear = Math.floor(today / 10000);
    const dates = [...title.matchAll(/\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(20\d{2}))?\b/g)];
    const eventDays = dates.map(match => {
      const day = Number(match[1]), month = months.indexOf(match[2]) + 1;
      let year = Number(match[3]) || currentYear;
      // A December article may announce the following January, and vice versa.
      if (!match[3]) {
        const publicationDay = dayKey(published), publicationMonth = Math.floor(publicationDay / 100) % 100;
        year = Math.floor(publicationDay / 10000);
        if (publicationMonth === 12 && month === 1) year++;
        if (publicationMonth === 1 && month === 12) year--;
      }
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? year * 10000 + month * 100 + day : null;
    }).filter(Boolean);
    if (eventDays.length && eventDays.every(day => day < today)) return null;
  }
  return {...article, pubDate};
}

