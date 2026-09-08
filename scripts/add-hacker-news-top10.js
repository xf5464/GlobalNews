'use strict';

const fs = require('node:fs');
const { addChineseTranslations } = require('./send-hot-news-email');

const ARCHIVE_PATH = String(process.env.HOT_NEWS_ARCHIVE_PATH || 'site/data/recent.json').trim();
const TOP_LIMIT = 10;
const HN_API_ROOT = 'https://hacker-news.firebaseio.com/v0';

async function fetchJson(url, timeout = 10000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'GlobalNews/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

async function fetchText(url, timeout = 10000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'GlobalNews/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

function storyToItem(item, index, category, now) {
  return {
    category,
    title: item.title,
    titleZh: '',
    url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
    source: 'Hacker News',
    sourceKey: `${category}-${item.id}`,
    sourceOrder: index,
    publishedAt: new Date(Number(item.time || 0) * 1000).toISOString(),
    score: Number(item.score || 0),
    engagement: `${Number(item.score || 0)} points · ${Number(item.descendants || 0)} comments`,
    fetchedAt: new Date(now).toISOString(),
    sourceUpdatedAt: new Date(now).toISOString(),
    isCached: false,
  };
}

async function fetchStoriesByIds(ids, category, now = Date.now()) {
  const candidates = await Promise.all(ids.map(async (id) => {
    try { return await fetchJson(`${HN_API_ROOT}/item/${id}.json`); }
    catch { return null; }
  }));
  const stories = candidates
    .filter((item) => item && item.type === 'story' && item.title)
    .slice(0, TOP_LIMIT)
    .map((item, index) => storyToItem(item, index, category, now));
  if (stories.length < TOP_LIMIT) throw new Error(`Hacker News returned only ${stories.length}/${TOP_LIMIT} usable ${category} stories.`);
  return addChineseTranslations(stories);
}

async function fetchHackerNewsTop10(now = Date.now()) {
  const ids = await fetchJson(`${HN_API_ROOT}/topstories.json`);
  return fetchStoriesByIds(ids.slice(0, 30), 'hn', now);
}

function frontStoryIds(html) {
  const ids = [];
  const pattern = /<tr\b[^>]*class=["'][^"']*\bathing\b[^"']*["'][^>]*\bid=["'](\d+)["'][^>]*>/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
    if (ids.length >= TOP_LIMIT) break;
  }
  return ids;
}

async function fetchHackerNewsFront10(now = Date.now()) {
  const html = await fetchText('https://news.ycombinator.com/front', 15000);
  const ids = frontStoryIds(html);
  if (ids.length < TOP_LIMIT) throw new Error(`Hacker News /front returned only ${ids.length}/${TOP_LIMIT} story ids.`);
  return fetchStoriesByIds(ids, 'hn-front', now);
}

function previousItems(archive, category) {
  return (archive.items || [])
    .filter((item) => item.category === category)
    .sort((left, right) => Number(left.sourceOrder) - Number(right.sourceOrder))
    .slice(0, TOP_LIMIT);
}

async function refreshedOrCached(archive, category, fetcher, label) {
  try {
    return await fetcher();
  } catch (error) {
    const previous = previousItems(archive, category);
    if (previous.length !== TOP_LIMIT) throw error;
    console.warn(`${label} refresh failed; kept previous Top 10: ${error.message}`);
    return previous.map((item) => ({ ...item, isCached: true }));
  }
}

async function main() {
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  const [hn, hnFront] = await Promise.all([
    refreshedOrCached(archive, 'hn', () => fetchHackerNewsTop10(), 'Hacker News current'),
    refreshedOrCached(archive, 'hn-front', () => fetchHackerNewsFront10(), 'Hacker News /front'),
  ]);
  archive.items = (archive.items || [])
    .filter((item) => item.category !== 'hn' && item.category !== 'hn-front')
    .concat(hn, hnFront);
  archive.trends = [];
  archive.updatedAt = new Date().toISOString();
  archive.refreshAttemptedAt = archive.updatedAt;
  fs.writeFileSync(ARCHIVE_PATH, `${JSON.stringify(archive, null, 2)}\n`, 'utf8');
  console.log(`Saved Hacker News current Top 10: ${hn.length} stories; /front Top 10: ${hnFront.length} stories.`);
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { fetchHackerNewsTop10, fetchHackerNewsFront10, frontStoryIds };
