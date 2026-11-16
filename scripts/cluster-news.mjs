import fs from 'node:fs/promises';
import { clusterRelatedNews } from './story-clusters.mjs';
import { sanitizeFeedArticle } from '../source-policy.mjs';
import { isOffTopicEditorialContent } from '../news-relevance.mjs';

const path = new URL('../news.json', import.meta.url);
const payload = JSON.parse(await fs.readFile(path, 'utf8'));
if (!payload.success || !Array.isArray(payload.news)) throw new Error('Invalid news feed');
// Recheck after video, focus and photo enrichment; no stage can reintroduce
// lifestyle items or restore them from a previous good feed.
const eligible = payload.news.filter(article => !isOffTopicEditorialContent(article))
  .map(sanitizeFeedArticle).filter(Boolean);
const news = clusterRelatedNews(eligible);
await fs.writeFile(path, JSON.stringify({...payload, news, total: news.length,
  editorialRelevance: {version: 'focused-news-v2', excluded: payload.news.length - eligible.length},
  storyClustering: {version: 1, before: payload.news.length, after: news.length}}, null, 2) + '\n');
console.log(`Story clusters: ${payload.news.length} -> ${news.length}`);

