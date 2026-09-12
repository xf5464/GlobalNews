const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const {
  NEWS_SOURCES,
  addChineseTranslations,
  archivedTitleTranslations,
  decodeXml,
  isPaywalledItem,
  isSimilarTitle,
  parseRssItems,
} = require('./send-hot-news-email');

const ARCHIVE_PATH = String(process.env.HOT_NEWS_ARCHIVE_PATH || 'site/data/recent.json').trim();
const USER_AGENT = 'GlobalNews/1.0 (+https://github.com/xf5464/GlobalNews)';
const MARKET_WINDOW_HOURS = 48;
const WORLD_WINDOW_HOURS = 48;
const ITEMS_PER_SOURCE = 4;
const WORLD_ITEMS_PER_SOURCE = 8;
const CORROBORATION_ITEMS_PER_SOURCE = 6;
const TOP_LIMIT = 10;

const MARKET_AUTHORITY = new Map([
  ['guardian-business', 27], ['yahoo-finance', 27], ['cnbc-markets', 30], ['bbc-business', 28],
  ['cnn-business', 27], ['npr-business', 27], ['benzinga', 22], ['the-street', 22],
  ['motley-fool', 21], ['ap-business', 30],
  ['paid-reuters-market', 33], ['paid-bloomberg-market', 32], ['paid-ft-market', 32],
  ['paid-wsj-market', 32], ['paid-barrons-market', 29], ['paid-seeking-alpha-market', 24],
  ['paid-ibd-market', 25], ['paid-business-insider-market', 24], ['paid-fortune-market', 25],
]);
const WORLD_AUTHORITY = new Map([
  ['reuters-world', 33], ['ap-world', 31], ['bbc-world', 30], ['al-jazeera', 28], ['dw-world', 27],
  ['france24', 27], ['guardian-world', 28], ['npr-world', 27], ['cnn-world', 27], ['un-news', 29],
  ['paid-reuters-world', 33], ['paid-nyt-world', 32], ['paid-economist-world', 32],
  ['paid-ft-world', 32], ['paid-wsj-world', 32], ['paid-bloomberg-world', 31],
]);
const COMMON_STOP = new Set(['about','after','against','amid','and','are','but','could','from','has','have','into','its','new','over','says','that','the','their','this','with','will','would','news','latest','live','update','updates','report','reports']);
const MARKET_IMPACT = [
  'fed','federal reserve','powell','interest rate','rates','treasury','yield','cpi','inflation','pce','payroll','jobs','unemployment','gdp','recession',
  's&p','s&p 500','nasdaq','dow','wall street','stocks','market','earnings','guidance','nvidia','apple','microsoft','amazon','meta','tesla','alphabet','google',
  'bank','banks','oil','tariff','trade','merger','acquisition','ipo','antitrust','semiconductor','chip','ai','artificial intelligence',
];
const WORLD_IMPACT = [
  'war','attack','strike','missile','military','nuclear','sanction','ceasefire','election','president','government','coup','protest','hostage','terror',
  'russia','ukraine','china','taiwan','iran','israel','gaza','north korea','south china sea','nato','united nations','tariff','trade','oil','energy','shipping',
  'earthquake','flood','hurricane','typhoon','wildfire','disaster','killed','dead','crisis','refugee','border',
];

const PAID_CORROBORATION_SOURCES = {
  tech: [
    { key: 'paid-reuters-tech', name: 'Reuters', query: 'site:reuters.com (technology OR AI OR chip OR software) when:2d', authority: 33 },
    { key: 'paid-bloomberg-tech', name: 'Bloomberg', query: 'site:bloomberg.com/technology when:2d', authority: 32 },
    { key: 'paid-ft-tech', name: 'Financial Times', query: 'site:ft.com (technology OR AI OR chips) when:2d', authority: 32 },
    { key: 'paid-wsj-tech', name: 'The Wall Street Journal', query: 'site:wsj.com/tech when:2d', authority: 32 },
    { key: 'paid-the-information-tech', name: 'The Information', query: 'site:theinformation.com (AI OR technology) when:2d', authority: 31 },
    { key: 'paid-business-insider-tech', name: 'Business Insider', query: 'site:businessinsider.com/tech when:2d', authority: 24 },
    { key: 'paid-fortune-tech', name: 'Fortune', query: 'site:fortune.com (AI OR tech) when:2d', authority: 25 },
  ],
  market: [
    { key: 'paid-reuters-market', name: 'Reuters', query: 'site:reuters.com/markets when:2d', authority: 33 },
    { key: 'paid-bloomberg-market', name: 'Bloomberg', query: 'site:bloomberg.com/markets when:2d', authority: 32 },
    { key: 'paid-ft-market', name: 'Financial Times', query: 'site:ft.com/markets when:2d', authority: 32 },
    { key: 'paid-wsj-market', name: 'The Wall Street Journal', query: 'site:wsj.com (markets OR stocks OR economy) when:2d', authority: 32 },
    { key: 'paid-barrons-market', name: "Barron's", query: 'site:barrons.com (markets OR stocks) when:2d', authority: 29 },
    { key: 'paid-seeking-alpha-market', name: 'Seeking Alpha', query: 'site:seekingalpha.com (market OR stocks) when:2d', authority: 24 },
    { key: 'paid-ibd-market', name: "Investor's Business Daily", query: 'site:investors.com/market-trend when:2d', authority: 25 },
    { key: 'paid-business-insider-market', name: 'Business Insider', query: 'site:businessinsider.com/markets when:2d', authority: 24 },
    { key: 'paid-fortune-market', name: 'Fortune', query: 'site:fortune.com (markets OR economy) when:2d', authority: 25 },
  ],
  world: [
    { key: 'paid-reuters-world', name: 'Reuters', query: 'site:reuters.com/world when:2d', authority: 33 },
    { key: 'paid-nyt-world', name: 'The New York Times', query: 'site:nytimes.com/section/world when:2d', authority: 32 },
    { key: 'paid-economist-world', name: 'The Economist', query: 'site:economist.com (world OR international) when:2d', authority: 32 },
    { key: 'paid-ft-world', name: 'Financial Times', query: 'site:ft.com/world when:2d', authority: 32 },
    { key: 'paid-wsj-world', name: 'The Wall Street Journal', query: 'site:wsj.com/world when:2d', authority: 32 },
    { key: 'paid-bloomberg-world', name: 'Bloomberg', query: 'site:bloomberg.com (politics OR geopolitics) when:2d', authority: 31 },
  ],
};

function hoursOld(value, now = Date.now()) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 3_600_000) : 999;
}
function stripTags(value = '') { return decodeXml(String(value)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function parseAtomItems(xml, category) {
  const blocks = String(xml).match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((block, index) => {
    const title = stripTags((block.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const link = (block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i) || [])[1] || '';
    const publishedAt = stripTags((block.match(/<(?:published|updated)(?:\s[^>]*)?>([\s\S]*?)<\/(?:published|updated)>/i) || [])[1] || '');
    return { category, title, url: link, publishedAt, feedRank: index };
  }).filter((item) => item.title && item.url);
}
function parseFeed(xml, category) { const rss = parseRssItems(xml, category, 0); return rss.length ? rss : parseAtomItems(xml, category); }
async function fetchText(url, timeout = 15000) {
  const target = new URL(url); target.searchParams.set('_dr', String(Date.now()));
  const response = await fetch(target, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': USER_AGENT, 'cache-control': 'no-cache', pragma: 'no-cache' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}
function googleNewsUrl(query) { const params = new URLSearchParams({ q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' }); return `https://news.google.com/rss/search?${params}`; }
function words(title) {
  return new Set(String(title || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff+.-]+/g, ' ').split(/\s+/).filter((token) => token.length > 2 && !COMMON_STOP.has(token)));
}
function overlapRatio(a, b) {
  const left = words(a); const right = words(b);
  if (!left.size || !right.size) return 0;
  let shared = 0; for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}
function sameEvent(a, b) {
  if (isSimilarTitle(a, b)) return true;
  const left = words(a); const right = words(b); if (!left.size || !right.size) return false;
  let shared = 0; for (const token of left) if (right.has(token)) shared += 1;
  return shared >= 2 && shared / Math.min(left.size, right.size) >= 0.34;
}
function sameWorldEvent(a, b) {
  if (isSimilarTitle(a, b)) return true;
  const left = words(a); const right = words(b); if (!left.size || !right.size) return false;
  let shared = 0; for (const token of left) if (right.has(token)) shared += 1;
  return shared >= 3 && shared / Math.min(left.size, right.size) >= 0.42;
}
function impactScore(title, keywords, cap) { const text = String(title || '').toLowerCase(); return Math.min(cap, keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 5 : 0), 0)); }
function isReuters(item) { return String(item?.sourceKey || '').toLowerCase().includes('reuters') || /\breuters\b/i.test(String(item?.source || '')); }
function isDisplayable(item) { return !item?.hiddenCorroboration && !isReuters(item) && !isPaywalledItem(item); }
function rankClusters(items, { category, authorityMap, impactKeywords, windowHours, now, matcher = sameEvent }) {
  const clusters = [];
  for (const item of [...items].sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))) {
    let cluster = clusters.find((candidate) => candidate.items.some((other) => matcher(item.title, other.title)));
    if (!cluster) { cluster = { items: [] }; clusters.push(cluster); }
    cluster.items.push(item);
  }
  return clusters.map((cluster) => {
    const sources = new Set(cluster.items.map((item) => item.sourceKey || item.source));
    const displayable = cluster.items.filter(isDisplayable); if (!displayable.length) return null;
    const representative = [...displayable].sort((a, b) => (authorityMap.get(b.sourceKey) || 20) - (authorityMap.get(a.sourceKey) || 20) || Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))[0];
    const newestAge = Math.min(...cluster.items.map((item) => hoursOld(item.publishedAt, now)));
    const freshness = Math.max(0, windowHours - newestAge);
    const authority = Math.max(...cluster.items.map((item) => authorityMap.get(item.sourceKey) || Number(item.authority) || 20));
    const impact = impactScore(representative.title, impactKeywords, category === 'market' ? 45 : 50);
    const confirmation = sources.size * (category === 'market' ? 38 : 42);
    const score = Math.round((confirmation + freshness * 1.25 + authority + impact) * 10) / 10;
    return { representative, sourceCount: sources.size, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || Date.parse(b.representative.publishedAt || 0) - Date.parse(a.representative.publishedAt || 0));
}
async function marketCandidates(now, existing) {
  const batches = await Promise.all((NEWS_SOURCES.market || []).map(async (source, sourceOrder) => {
    const feedUrl = source.headlineFeed || source.feed; if (!feedUrl) return [];
    try {
      const xml = await fetchText(feedUrl);
      return parseFeed(xml, 'market').filter((item) => item.title && item.url && !isPaywalledItem(item)).filter((item) => !item.publishedAt || hoursOld(item.publishedAt, now) <= MARKET_WINDOW_HOURS).slice(0, ITEMS_PER_SOURCE).map((item) => ({ ...item, category: 'market', source: source.name, sourceKey: source.key, sourceOrder }));
    } catch (error) { console.warn(`${source.name} market feed failed: ${error.message}`); return existing.filter((item) => item.sourceKey === source.key).slice(0, 1); }
  }));
  return batches.flat();
}
async function worldCandidates(now, existing) {
  const visibleSources = (NEWS_SOURCES.world || []).filter((source) => source.key !== 'reuters-world');
  const batches = await Promise.all(visibleSources.map(async (source, sourceOrder) => {
    if (!source.query) return [];
    try {
      const xml = await fetchText(googleNewsUrl(source.query));
      return parseFeed(xml, 'world')
        .filter((item) => item.title && item.url && !isPaywalledItem(item))
        .filter((item) => !item.publishedAt || hoursOld(item.publishedAt, now) <= WORLD_WINDOW_HOURS)
        .slice(0, WORLD_ITEMS_PER_SOURCE)
        .map((item) => ({ ...item, category: 'world', source: source.name, sourceKey: source.key, sourceOrder, hiddenCorroboration: false }));
    } catch (error) {
      console.warn(`${source.name} world feed failed: ${error.message}`);
      return existing.filter((item) => item.sourceKey === source.key && isDisplayable(item)).slice(0, 2);
    }
  }));
  return batches.flat();
}
async function corroborationCandidates(category, now) {
  const sources = PAID_CORROBORATION_SOURCES[category] || [];
  const batches = await Promise.all(sources.map(async (source, sourceOrder) => {
    try {
      const xml = await fetchText(googleNewsUrl(source.query));
      return parseFeed(xml, category).filter((item) => item.title && item.url).filter((item) => !item.publishedAt || hoursOld(item.publishedAt, now) <= 48).slice(0, CORROBORATION_ITEMS_PER_SOURCE).map((item) => ({ ...item, category, source: source.name, sourceKey: source.key, sourceOrder, authority: source.authority, hiddenCorroboration: true }));
    } catch (error) { console.warn(`${source.name} ${category} corroboration feed failed: ${error.message}`); return []; }
  }));
  return batches.flat();
}
async function translateRepresentatives(items) {
  const known = archivedTitleTranslations(ARCHIVE_PATH);
  const prepared = items.map((item) => ({ ...item, titleZh: known.get(item.url) || item.titleZh || '' }));
  return addChineseTranslations(prepared, 450, { strict: false });
}
function augmentTechWithPaidCorroboration(tech, paidTech) {
  return tech.map((item) => {
    const matchingPaid = paidTech.filter((candidate) => sameEvent(item.title, candidate.title));
    const hiddenSourceCount = new Set(matchingPaid.map((candidate) => candidate.sourceKey)).size; if (!hiddenSourceCount) return item;
    const currentCount = Number(String(item.engagement || '').match(/(\d+)家/)?.[1] || 1); const sourceCount = currentCount + hiddenSourceCount;
    return { ...item, score: Math.round((Number(item.score || 0) + hiddenSourceCount * 34) * 10) / 10, engagement: `${sourceCount}家科技媒体交叉确认` };
  }).sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
}

function categoryItems(archive, category) {
  return (archive.items || [])
    .filter((item) => item.category === category && !isPaywalledItem(item))
    .sort((left, right) => Number(left.sourceOrder) - Number(right.sourceOrder))
    .slice(0, TOP_LIMIT);
}

function isUsableCategory(items) {
  return items.length === TOP_LIMIT && items.every((item) => item?.url && item?.title);
}

function cachedFallback(items) {
  return items.map((item) => ({ ...item, isCached: true }));
}

async function refreshCategory(category, previous, producer) {
  try {
    const items = await producer();
    if (!isUsableCategory(items)) throw new Error(`${category} returned only ${items.length}/${TOP_LIMIT} complete items`);
    return items;
  } catch (error) {
    if (!isUsableCategory(previous)) throw error;
    console.warn(`${category} category refresh failed; kept its previous Top 10: ${error.message}`);
    return cachedFallback(previous);
  }
}

async function main() {
  const originalArchive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  let baseRefreshSucceeded = true;
  try {
    execFileSync(process.execPath, ['scripts/refresh-reader-news.js'], { stdio: 'inherit', env: process.env });
  } catch (error) {
    baseRefreshSucceeded = false;
    console.warn(`Base technology/market refresh failed; category fallbacks remain available: ${error.message}`);
  }
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8')); const now = Date.now();
  const previousMarket = categoryItems(originalArchive, 'market');
  const previousWorld = categoryItems(originalArchive, 'world');
  const previousTech = categoryItems(originalArchive, 'tech');
  const existingMarket = (archive.items || []).filter((item) => item.category === 'market');
  const existingWorld = (archive.items || []).filter((item) => item.category === 'world');
  const existingTech = (archive.items || []).filter((item) => item.category === 'tech');

  const [marketFree, worldFree, paidMarket, paidWorld, paidTech] = await Promise.all([
    marketCandidates(now, existingMarket), worldCandidates(now, existingWorld), corroborationCandidates('market', now), corroborationCandidates('world', now), corroborationCandidates('tech', now),
  ]);

  const marketPool = [...marketFree, ...paidMarket];
  const worldPool = [...worldFree, ...paidWorld];
  const [market, world] = await Promise.all([
    refreshCategory('market', previousMarket, async () => {
      const clusters = rankClusters(marketPool, { category: 'market', authorityMap: MARKET_AUTHORITY, impactKeywords: MARKET_IMPACT, windowHours: MARKET_WINDOW_HOURS, now }).slice(0, TOP_LIMIT);
      const items = clusters.map((cluster, index) => ({ ...cluster.representative, category: 'market', sourceKey: `market-event-${index + 1}`, sourceOrder: index, score: cluster.score, engagement: cluster.sourceCount >= 2 ? `${cluster.sourceCount}家财经媒体交叉确认` : '单一来源', fetchedAt: new Date(now).toISOString(), sourceUpdatedAt: new Date(now).toISOString(), isCached: false }));
      return translateRepresentatives(items);
    }),
    refreshCategory('world', previousWorld, async () => {
      const clusters = rankClusters(worldPool, { category: 'world', authorityMap: WORLD_AUTHORITY, impactKeywords: WORLD_IMPACT, windowHours: WORLD_WINDOW_HOURS, now, matcher: sameWorldEvent }).slice(0, TOP_LIMIT);
      const items = clusters.map((cluster, index) => ({ ...cluster.representative, category: 'world', sourceKey: `world-event-${index + 1}`, sourceOrder: index, score: cluster.score, engagement: cluster.sourceCount >= 2 ? `${cluster.sourceCount}家国际媒体交叉确认` : '单一来源', fetchedAt: new Date(now).toISOString(), sourceUpdatedAt: new Date(now).toISOString(), isCached: false }));
      return translateRepresentatives(items);
    }),
  ]);

  const candidateTech = baseRefreshSucceeded ? augmentTechWithPaidCorroboration(existingTech, paidTech) : [];
  const tech = isUsableCategory(candidateTech) ? candidateTech : cachedFallback(previousTech);
  if (!isUsableCategory(candidateTech)) console.warn('tech category refresh failed; kept its previous Top 10.');
  if (!isUsableCategory(tech)) throw new Error(`tech has no complete ${TOP_LIMIT}-item fallback`);
  const refreshedAt = new Date(now).toISOString();
  archive.items = (archive.items || []).filter((item) => !['tech', 'market', 'world'].includes(item.category)).concat(tech, market, world);
  archive.updatedAt = refreshedAt; archive.refreshAttemptedAt = refreshedAt;
  archive.categoryAttemptedAt = { ...(originalArchive.categoryAttemptedAt || {}), tech: refreshedAt, market: refreshedAt, world: refreshedAt };
  archive.categoryUpdatedAt = { ...(originalArchive.categoryUpdatedAt || {}) };
  for (const [category, items] of Object.entries({ tech, market, world })) {
    if (items.some((item) => !item.isCached)) archive.categoryUpdatedAt[category] = refreshedAt;
  }
  archive.failureCount = archive.items.filter((item) => item.isCached).length;
  fs.writeFileSync(ARCHIVE_PATH, `${JSON.stringify(archive, null, 2)}\n`, 'utf8');
  console.log(`Event aggregation complete: tech=${tech.length} (+${paidTech.length} hidden corroborators), market=${market.length}/${marketPool.length} candidates, world=${world.length}/${worldPool.length} candidates.`);
  console.log('Reuters and all configured paywalled sources are corroboration-only and cannot be displayed as representative links.');
}

if (require.main === module) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}

module.exports = { cachedFallback, isUsableCategory, refreshCategory };
