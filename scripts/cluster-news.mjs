import fs from 'node:fs/promises';
import { clusterRelatedNews } from './story-clusters.mjs';

const path = new URL('../news.json', import.meta.url);
const payload = JSON.parse(await fs.readFile(path, 'utf8'));
if (!payload.success || !Array.isArray(payload.news)) throw new Error('Invalid news feed');
const news = clusterRelatedNews(payload.news);
await fs.writeFile(path, JSON.stringify({...payload, news, total: news.length,
  storyClustering: {version: 1, before: payload.news.length, after: news.length}}, null, 2) + '\n');
console.log(`Story clusters: ${payload.news.length} -> ${news.length}`);
