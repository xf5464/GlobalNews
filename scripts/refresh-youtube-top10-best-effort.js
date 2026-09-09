const fs = require('node:fs');
const { itemId } = require('./hot-news-archive');
const {
  addChineseTranslations,
  isLanguageNeutralTitle,
  youtubeItemsFromResponses,
} = require('./send-hot-news-email');

const ARCHIVE_PATH = String(process.env.HOT_NEWS_ARCHIVE_PATH || 'site/data/recent.json').trim();
const API_KEY = String(process.env.YOUTUBE_API_KEY || '').trim();
const LOOKBACK_HOURS = 24;
const MAX_ITEMS = 10;
const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;
const YOUTUBE_QUERY = '"artificial intelligence"|"technology news"|"stock market"|"Wall Street"|Nvidia|Tesla -movie -film -trailer -music';

function containsChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value || ''));
}

async function fetchJson(url, timeout = 15000) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: { 'user-agent': 'GlobalNews/1.0 (+https://github.com/xf5464/GlobalNews)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

function latestYoutubeTimestamp(archive) {
  const recorded = Date.parse(archive?.categoryAttemptedAt?.youtube || archive?.categoryUpdatedAt?.youtube || '');
  if (Number.isFinite(recorded)) return recorded;
  const timestamps = (archive?.items || [])
    .filter((item) => item.category === 'youtube')
    .flatMap((item) => [Date.parse(item.sourceUpdatedAt || ''), Date.parse(item.fetchedAt || '')])
    .filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : 0;
}

function shouldRefreshYouTube(archive, now = Date.now()) {
  const previous = latestYoutubeTimestamp(archive);
  return !previous || now - previous >= REFRESH_INTERVAL_MS;
}

function writeArchive(archive) {
  fs.writeFileSync(ARCHIVE_PATH, `${JSON.stringify(archive, null, 2)}\n`, 'utf8');
}

async function main() {
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  const previousYoutube = (archive.items || []).filter((item) => item.category === 'youtube');
  const now = Date.now();
  if (!shouldRefreshYouTube(archive, now)) {
    const nextAt = new Date(latestYoutubeTimestamp(archive) + REFRESH_INTERVAL_MS).toISOString();
    console.log(`Skipped YouTube refresh; next four-hour attempt is due at ${nextAt}.`);
    return;
  }

  const attemptedAt = new Date(now).toISOString();
  archive.categoryAttemptedAt = { ...(archive.categoryAttemptedAt || {}), youtube: attemptedAt };
  const knownTranslations = new Map(previousYoutube.filter((item) => item.url && item.titleZh).map((item) => [item.url, item.titleZh]));
  let freshYoutube;
  let refreshed = false;
  try {
    if (!API_KEY) throw new Error('Missing required environment variable: YOUTUBE_API_KEY');
    const publishedAfter = new Date(now - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    const searchParams = new URLSearchParams({
      part: 'snippet', type: 'video', maxResults: '50', order: 'viewCount',
      q: YOUTUBE_QUERY, publishedAfter, regionCode: 'US', relevanceLanguage: 'en',
      safeSearch: 'moderate', key: API_KEY,
    });
    const searchPayload = await fetchJson(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
    const videoIds = (searchPayload.items || []).map((item) => item?.id?.videoId).filter(Boolean);
    if (!videoIds.length) throw new Error('YouTube returned no recent videos.');

    const videoParams = new URLSearchParams({
      part: 'snippet,statistics', id: videoIds.join(','), maxResults: '50', key: API_KEY,
    });
    const videosPayload = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${videoParams}`);
    const items = youtubeItemsFromResponses(searchPayload, videosPayload).slice(0, 25);
    if (items.length < MAX_ITEMS) throw new Error(`YouTube returned only ${items.length}/${MAX_ITEMS} usable videos.`);

    const attempted = await addChineseTranslations(items.map((item) => ({
      ...item,
      titleZh: knownTranslations.get(item.url) || '',
    })), 450, { strict: false });
    const translated = attempted.filter((item) =>
      containsChinese(item.title) ||
      containsChinese(item.titleZh) ||
      isLanguageNeutralTitle(item.title));
    if (translated.length < MAX_ITEMS) {
      throw new Error(`Only ${translated.length}/${MAX_ITEMS} YouTube titles translated from ${attempted.length} candidates.`);
    }
    freshYoutube = translated.slice(0, MAX_ITEMS).map((item, index) => ({
      ...item,
      sourceOrder: index,
      id: itemId(item.url),
      fetchedAt: attemptedAt,
      sourceUpdatedAt: attemptedAt,
      isCached: false,
    }));
    refreshed = true;
  } catch (error) {
    const translatedPrevious = previousYoutube
      .filter((item) => containsChinese(item.title) || containsChinese(item.titleZh) || isLanguageNeutralTitle(item.title))
      .sort((left, right) => Number(left.sourceOrder) - Number(right.sourceOrder))
      .slice(0, MAX_ITEMS);
    if (translatedPrevious.length !== MAX_ITEMS) throw error;
    freshYoutube = translatedPrevious.map((item) => ({ ...item, isCached: true }));
    console.warn(`YouTube four-hour refresh failed; kept the previous Top 10: ${error.message}`);
  }

  archive.items = [...(archive.items || []).filter((item) => item.category !== 'youtube'), ...freshYoutube];
  archive.updatedAt = attemptedAt;
  archive.refreshAttemptedAt = attemptedAt;
  archive.categoryUpdatedAt = { ...(archive.categoryUpdatedAt || {}) };
  if (refreshed) archive.categoryUpdatedAt.youtube = attemptedAt;
  archive.failureCount = archive.items.filter((item) => item.isCached).length;
  writeArchive(archive);
  console.log(refreshed
    ? 'Saved YouTube Top 10; all displayed titles have Chinese translations.'
    : 'Published other categories with the previous YouTube Top 10.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { REFRESH_INTERVAL_MS, latestYoutubeTimestamp, shouldRefreshYouTube };
