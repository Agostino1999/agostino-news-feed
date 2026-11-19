import fs from 'node:fs/promises';
import '../news-intelligence.js';
import { clusterRelatedNews } from './story-clusters.mjs';
import { sanitizeFeedArticle } from '../source-policy.mjs';
import { isOffTopicEditorialContent } from '../news-relevance.mjs';

const path = new URL('../news.json', import.meta.url);
const payload = JSON.parse(await fs.readFile(path, 'utf8'));
if (!payload.success || !Array.isArray(payload.news)) throw new Error('Invalid news feed');
// Recheck after video, focus and photo enrichment; no stage can reintroduce
// lifestyle items or restore them from a previous good feed.
const eligible = payload.news.map(article=>globalThis.NewsIntelligence.classifyArticle(article)).filter(article => !isOffTopicEditorialContent(article))
  .map(sanitizeFeedArticle).filter(Boolean);
const news = clusterRelatedNews(eligible).map(article=>globalThis.NewsIntelligence.classifyArticle(article));
const previous = await fs.readFile(new URL('../.previous-news.json',import.meta.url),'utf8').then(JSON.parse).catch(()=>({}));
const topicHistory=globalThis.NewsIntelligence.collectHistory(news,previous.topicHistory||payload.topicHistory||{});
await fs.writeFile(path, JSON.stringify({...payload, news, total: news.length, topicHistory,
  editorialRelevance: {version: 'focused-news-v2', excluded: payload.news.length - eligible.length},
  storyClustering: {version: 1, before: payload.news.length, after: news.length}}, null, 2) + '\n');
console.log(`Story clusters: ${payload.news.length} -> ${news.length}`);


