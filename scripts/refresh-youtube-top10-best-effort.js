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

async function main() {
  if (!API_KEY) throw new Error('Missing required environment variable: YOUTUBE_API_KEY');

  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  const previousYoutube = (archive.items || []).filter((item) => item.category === 'youtube');
  const knownTranslations = new Map(previousYoutube.filter((item) => item.url && item.titleZh).map((item) => [item.url, item.titleZh]));
  const now = Date.now();
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
  const items = youtubeItemsFromResponses(searchPayload, videosPayload).slice(0, MAX_ITEMS);
  if (items.length < MAX_ITEMS) throw new Error(`YouTube returned only ${items.length}/${MAX_ITEMS} usable videos.`);

  const attempted = await addChineseTranslations(items.map((item) => ({
    ...item,
    titleZh: knownTranslations.get(item.url) || '',
  })), 450, { strict: false });
  const untranslated = attempted.filter((item) =>
    !containsChinese(item.title) &&
    !containsChinese(item.titleZh) &&
    !isLanguageNeutralTitle(item.title));
  const fetchedAt = new Date(now).toISOString();
  let freshYoutube;
  if (untranslated.length) {
    const translatedPrevious = previousYoutube
      .filter((item) => containsChinese(item.title) || containsChinese(item.titleZh))
      .sort((left, right) => Number(left.sourceOrder) - Number(right.sourceOrder))
      .slice(0, MAX_ITEMS);
    if (translatedPrevious.length !== MAX_ITEMS) {
      throw new Error(`Refusing to publish ${untranslated.length} untranslated YouTube title(s) without a complete translated fallback.`);
    }
    freshYoutube = translatedPrevious.map((item) => ({ ...item, isCached: true }));
    console.warn(`YouTube translation failed for ${untranslated.length} item(s); reused the previous translated Top 10.`);
  } else {
    freshYoutube = attempted.map((item) => ({
      ...item,
      id: itemId(item.url),
      fetchedAt,
      sourceUpdatedAt: fetchedAt,
      isCached: false,
    }));
  }

  const hadCachedYoutubeFallback = previousYoutube.length === MAX_ITEMS && previousYoutube.every((item) => item.isCached);
  archive.items = [...(archive.items || []).filter((item) => item.category !== 'youtube'), ...freshYoutube];
  if (hadCachedYoutubeFallback && Number(archive.failureCount) > 0) archive.failureCount = Number(archive.failureCount) - 1;
  archive.updatedAt = fetchedAt;
  archive.refreshAttemptedAt = fetchedAt;
  fs.writeFileSync(ARCHIVE_PATH, `${JSON.stringify(archive, null, 2)}\n`, 'utf8');
  console.log('Saved YouTube Top 10; all displayed titles have Chinese translations.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
