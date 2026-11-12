import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function pollsRefreshDue(feed, now = Date.now()) {
  if (feed?.schemaVersion !== 1 || feed?.success !== true || !Array.isArray(feed.polls) || !feed.polls.length) return true;
  const checked = Date.parse(feed.checkedAt);
  if (!Number.isFinite(checked) || checked > now + 300_000) return true;
  // Retry partial source failures sooner while retaining the last valid archive.
  const interval = feed.sources?.some(source => !source.ok) ? 30 * 60_000 : 2 * 60 * 60_000;
  return now - checked >= interval;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let feed;
  try { feed = JSON.parse(readFileSync(process.argv[2] || 'polls.json', 'utf8')); } catch {}
  console.log(`due=${pollsRefreshDue(feed)}`);
}

