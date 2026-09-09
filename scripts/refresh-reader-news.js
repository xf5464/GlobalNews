const {
  NEWS_SOURCES,
  addChineseTranslations,
  archivedGoogleNewsUrls,
  archivedSourceItems,
  archivedTitleTranslations,
  cleanMarkdownTitle,
  collectHotNews,
  decodeXml,
  isPaywalledItem,
  isSimilarTitle,
  parseRssItems,
  publishedDateFromHtml,
} = require('./send-hot-news-email');
const { saveNewsArchive } = require('./hot-news-archive');
const { collectSocialWordCloud } = require('./social-word-cloud');

const USER_AGENT = 'GlobalNews/1.0 (+https://github.com/xf5464/GlobalNews)';
const FEED_FALLBACK_MAX_AGE_HOURS = 72;
const TECH_WINDOW_HOURS = 48;
const TECH_ITEMS_PER_SOURCE = 4;

// Main technology pool: broad, high-quality, mostly free sources. Consumer-deal-heavy
// outlets (TechRadar/PCMag/Tom's Hardware) are intentionally excluded from this tab.
const TECH_SOURCES = [
  { key: 'techcrunch', name: 'TechCrunch', homepage: 'https://techcrunch.com/', feed: 'https://techcrunch.com/feed/', hosts: ['techcrunch.com'], pattern: '^/\\d{4}/\\d{2}/\\d{2}/', authority: 30 },
  { key: 'the-verge', name: 'The Verge', homepage: 'https://www.theverge.com/tech', feed: 'https://www.theverge.com/rss/index.xml', hosts: ['theverge.com'], pattern: '^/(news|tech|ai-artificial-intelligence)/', authority: 29 },
  { key: 'ars-technica', name: 'Ars Technica', homepage: 'https://arstechnica.com/', feed: 'https://feeds.arstechnica.com/arstechnica/index', hosts: ['arstechnica.com'], pattern: '^/[a-z-]+/\\d{4}/\\d{2}/', authority: 30 },
  { key: 'wired', name: 'WIRED', homepage: 'https://www.wired.com/category/tech/', feed: 'https://www.wired.com/feed/rss', hosts: ['wired.com'], pattern: '^/story/', authority: 30 },
  { key: 'mit-tech-review', name: 'MIT Technology Review', homepage: 'https://www.technologyreview.com/', feed: 'https://www.technologyreview.com/feed/', hosts: ['technologyreview.com'], pattern: '^/\\d{4}/', authority: 31 },
  { key: 'ieee-spectrum', name: 'IEEE Spectrum', homepage: 'https://spectrum.ieee.org/', feed: 'https://spectrum.ieee.org/feeds/feed.rss', hosts: ['spectrum.ieee.org'], pattern: '^/', authority: 31 },
  { key: 'engadget', name: 'Engadget', homepage: 'https://www.engadget.com/', feed: 'https://www.engadget.com/rss.xml', hosts: ['engadget.com'], pattern: '^/', authority: 25 },
  { key: 'techspot', name: 'TechSpot', homepage: 'https://www.techspot.com/', feed: 'https://www.techspot.com/backend.xml', hosts: ['techspot.com'], pattern: '^/news/', authority: 25 },
  { key: 'bleepingcomputer', name: 'BleepingComputer', homepage: 'https://www.bleepingcomputer.com/', feed: 'https://www.bleepingcomputer.com/feed/', hosts: ['bleepingcomputer.com'], pattern: '^/news/', authority: 27 },
  { key: 'venturebeat', name: 'VentureBeat', homepage: 'https://venturebeat.com/', feed: 'https://venturebeat.com/feed/', hosts: ['venturebeat.com'], pattern: '^/', authority: 24 },
  { key: 'zdnet', name: 'ZDNET', homepage: 'https://www.zdnet.com/', feed: 'https://www.zdnet.com/news/rss.xml', hosts: ['zdnet.com'], pattern: '^/article/', authority: 25 },
  { key: '9to5mac', name: '9to5Mac', homepage: 'https://9to5mac.com/', feed: 'https://9to5mac.com/feed/', hosts: ['9to5mac.com'], pattern: '^/\\d{4}/', authority: 22 },
  { key: 'android-authority', name: 'Android Authority', homepage: 'https://www.androidauthority.com/', feed: 'https://www.androidauthority.com/feed/', hosts: ['androidauthority.com'], pattern: '^/', authority: 21 },
  { key: 'digital-trends', name: 'Digital Trends', homepage: 'https://www.digitaltrends.com/computing/', feed: 'https://www.digitaltrends.com/feed/', hosts: ['digitaltrends.com'], pattern: '^/', authority: 21 },
  { key: 'securityweek', name: 'SecurityWeek', homepage: 'https://www.securityweek.com/', feed: 'https://www.securityweek.com/feed/', hosts: ['securityweek.com'], pattern: '^/', authority: 25 },
  { key: 'siliconangle', name: 'SiliconANGLE', homepage: 'https://siliconangle.com/', feed: 'https://siliconangle.com/feed/', hosts: ['siliconangle.com'], pattern: '^/', authority: 22 },
  { key: 'hacker-news', name: 'Hacker News', special: 'hacker-news', authority: 23 },
];

const TECH_STOP_WORDS = new Set([
  'about','after','again','against','amid','and','are','but','could','from','gets','has','have','into','its','new','now','over','says','that','the','their','this','through','to','with','will','your',
  'tech','technology','report','reports','latest','live','update','updates','review','reviews','best','why','how','what','when','where',
]);
const TECH_IMPACT_KEYWORDS = [
  'ai','artificial intelligence','openai','chatgpt','anthropic','google','gemini','apple','iphone','microsoft','meta','nvidia','amd','intel','chip','semiconductor','robot','robotics','quantum','security','cyber','zero-day','breach','startup','funding','ipo','acquisition','merger','ban','regulation','lawsuit','launch','release','model','datacenter','data center','cloud','space','rocket',
];

function environmentFlag(value) { return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase()); }
function hoursOld(value, now = Date.now()) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 3_600_000) : 999;
}
async function fetchText(url, timeout = 15_000) {
  const target = new URL(url); target.searchParams.set('_dr', String(Date.now()));
  const response = await fetch(target, {
    redirect: 'follow', cache: 'no-store',
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8', 'cache-control': 'no-cache', pragma: 'no-cache' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}
function stripTags(value = '') { return decodeXml(String(value)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function cleanHeadlineText(value = '') {
  return cleanMarkdownTitle(decodeXml(String(value)))
    .replace(/\s+Published\s+\d{1,2}\s+[A-Za-z]+\s+\d{2,4}\s*$/i, '')
    .replace(/\s+Published\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4}\s*$/i, '')
    .replace(/\s+Updated\s+\d{1,2}\s+[A-Za-z]+\s+\d{2,4}\s*$/i, '')
    .replace(/\s+\d+\s+(?:mins?|hours?|days?)\s+ago(?:\s+.+)?$/i, '')
    .replace(/\s+/g, ' ').trim();
}
function isClearlyNonTechHeadline(title, url = '') {
  const text = `${title} ${url}`.toLowerCase();
  return /\b(season\s*\d+|episode\s*\d+|release date|trailer|movie|film|tv series|tv show|prime video series|netflix series|hulu series|disney\+ series|premier league|champions league|arsenal|chelsea|manchester united|liverpool|watch .* free|free stream|live stream|kickoff|kick-off)\b/.test(text)
    || /\b(best .* deals?|deal of the day|save up to|coupon|discount|labor day sale|black friday|prime day)\b/.test(text)
    || (/\/streaming\//.test(text) && /\b(season|episode|series|movie|film|sports?|football|soccer)\b/.test(text));
}
function isClearlyNonMarketHeadline(title) {
  const text = String(title || '').toLowerCase();
  return /\b(tantrum|parenting|recipe|dating advice|relationship advice|horoscope|celebrity gossip|meat allergy|ostrich farming)\b/.test(text);
}
function hasReadableHeadlineShape(title) {
  const text = String(title || '').trim();
  if (!text) return false;
  if (/^[A-Za-z0-9+._&'’-]+$/.test(text) && !/\s/.test(text) && text.length >= 14) return false;
  return true;
}
function normalizedPath(url) { return url.pathname.replace(/\/+$/, '') || '/'; }
function isUtilityOrSectionUrl(rawUrl, homepage) {
  try {
    const url = new URL(rawUrl, homepage); const home = new URL(homepage);
    if (url.origin === home.origin && normalizedPath(url) === normalizedPath(home)) return true;
    return /\/(?:category|series|tag|topic|membership|subscribe|newsletter|podcasts?|deals?|coupons?|sports?|streaming)(?:\/|$)/i.test(url.pathname);
  } catch { return true; }
}
function isAcceptableHeadline(category, title, url, homepage = '') {
  const blockedTitle = /^(?:skip to (?:main )?content|become a member|project syndicate|market forecast|evs?\s*&\s*transportation|large cap stocks|home|news|markets?|technology|tech|read more|view all|latest|subscribe|sign in|log in)$/i;
  if (!title || !url || !hasReadableHeadlineShape(title) || blockedTitle.test(String(title).trim())) return false;
  if (homepage && isUtilityOrSectionUrl(url, homepage)) return false;
  if (category === 'tech' && isClearlyNonTechHeadline(title, url)) return false;
  if (category === 'market' && isClearlyNonMarketHeadline(title)) return false;
  return true;
}
function linkCandidates(content) {
  const text = String(content || '');
  const markdownHeadings = [...text.matchAll(/^#{1,3}\s+\[([^\]]+)\]\(([^\s)]+)[^)]*\)/gm)].map((m) => [m[1], m[2]]);
  const headingLinks = [...text.matchAll(/<h[1-3]\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h[1-3]>/gi)].map((m) => [stripTags(m[2]), m[1]]);
  const linkedHeadings = [...text.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>[\s\S]*?<\/a>/gi)].map((m) => [stripTags(m[2]), m[1]]);
  const markdownLinks = [...text.matchAll(/\[([^\]]+)\]\(([^\s)]+)[^)]*\)/g)].map((m) => [m[1], m[2]]);
  const htmlLinks = [...text.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => [stripTags(m[2]), m[1]]);
  return [...markdownHeadings, ...headingLinks, ...linkedHeadings, ...markdownLinks, ...htmlLinks];
}
function parseSectionHeadline(content, source, category, homepage) {
  const patternText = source.articlePattern || source.pattern;
  const pattern = patternText ? new RegExp(patternText, 'i') : null;
  for (const [rawTitle, rawUrl] of linkCandidates(content)) {
    const title = cleanHeadlineText(rawTitle);
    if (title.length < 15 || title.length > 220) continue;
    try {
      const url = new URL(decodeXml(rawUrl), homepage); const host = url.hostname.toLowerCase().replace(/^www\./, '');
      const hosts = source.hosts || [];
      if (hosts.length && !hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) continue;
      if (pattern && !pattern.test(url.pathname)) continue;
      url.hash = '';
      if (!isAcceptableHeadline(category, title, url.toString(), homepage)) continue;
      return { title, url: url.toString() };
    } catch {}
  }
  throw new Error(`${source.name} section page returned no usable lead story`);
}
function parseAtomItems(xml, category) {
  const blocks = String(xml).match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((block, index) => {
    const title = stripTags((block.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const linkMatch = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
    const published = stripTags((block.match(/<(?:published|updated)(?:\s[^>]*)?>([\s\S]*?)<\/(?:published|updated)>/i) || [])[1] || '');
    return { category, title, url: linkMatch?.[1] || '', publishedAt: published, feedRank: index, score: 0 };
  }).filter((item) => item.title && item.url);
}
function parseFeedItems(xml, category) {
  const rss = parseRssItems(xml, category, 0);
  return rss.length ? rss : parseAtomItems(xml, category);
}
async function fetchOfficialFeed(source, category, now, maxAge = FEED_FALLBACK_MAX_AGE_HOURS) {
  const feedUrl = source.headlineFeed || source.feed;
  if (!feedUrl) return [];
  const xml = await fetchText(feedUrl, 15_000);
  return parseFeedItems(xml, category)
    .map((item) => ({ ...item, title: cleanHeadlineText(item.title), source: source.name, sourceKey: source.key }))
    .filter((item) => !isPaywalledItem(item))
    .filter((item) => isAcceptableHeadline(category, item.title, item.url))
    .filter((item) => !item.publishedAt || hoursOld(item.publishedAt, now) <= maxAge)
    .sort((left, right) => Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0));
}
async function readSectionLead(source, category) {
  const homepage = source.homepage; let firstError;
  try { return parseSectionHeadline(await fetchText(homepage, 15_000), source, category, homepage); }
  catch (error) { firstError = error; }
  const target = new URL(homepage); const jinaUrl = `https://r.jina.ai/http://${target.host}${target.pathname}${target.search}`;
  try { return parseSectionHeadline(await fetchText(jinaUrl, 20_000), source, category, homepage); }
  catch (error) { throw new Error(`${firstError?.message || 'section fetch failed'}; reader fallback: ${error.message}`); }
}
async function publishedAtForLead(lead, source, category, now) {
  try { const publishedAt = publishedDateFromHtml(await fetchText(lead.url, 10_000)); if (publishedAt) return publishedAt; } catch {}
  try {
    const feedItems = await fetchOfficialFeed(source, category, now);
    const similar = feedItems.find((item) => item.url === lead.url) || feedItems.find((item) => isSimilarTitle(item.title, lead.title));
    if (similar?.publishedAt) return similar.publishedAt;
  } catch {}
  return '';
}
function freshMetadata(item, now) { const stamp = new Date(now).toISOString(); return { ...item, fetchedAt: stamp, sourceUpdatedAt: stamp, isCached: false }; }
function cachedMetadata(item) { const stamp = item?.sourceUpdatedAt || item?.fetchedAt || item?.pushedAt || ''; return { ...item, fetchedAt: item?.fetchedAt || stamp, sourceUpdatedAt: stamp, isCached: true }; }
function normalizeBaselineFreshness(item, now) { return item?.fetchedAt || item?.sourceUpdatedAt ? cachedMetadata(item) : freshMetadata(item, now); }
function containsChinese(value) { return /[\u3400-\u9fff]/.test(String(value || '')); }
function polishChineseTitle(item) {
  let titleZh = decodeXml(String(item.titleZh || item.title || '')).trim()
    .replace(/\s+([，。！？：；、）】》])/g, '$1').replace(/([（【《])\s+/g, '$1').replace(/\s{2,}/g, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*\$/g, '$$$1').replace(/\$\s+(\d)/g, '$$$1')
    .replace(/\s*(?:26年)?9月6日发布\s*$/i, '').replace(/\s*发布于?\s*\d{1,2}月\d{1,2}日\s*$/i, '');
  if (/\bagents?\b/i.test(item.title || '')) titleZh = titleZh.replace(/特工|代理人|代理/g, '智能体');
  if (/\bstocks?\b/i.test(item.title || '')) titleZh = titleZh.replace(/库存/g, '股票');
  if (/\bsolid[- ]state drive\b|\bssd\b/i.test(item.title || '')) titleZh = titleZh.replace(/固态驱动器/g, '固态硬盘');
  if (/intellectual fly is open/i.test(item.title || '')) titleZh = '你的“知识裤链”没拉上';
  return { ...item, title: cleanHeadlineText(item.title), titleZh };
}
async function translateItems(items, knownTranslations, previousBySource, baselineBySource) {
  const prepared = items.map((item) => ({
    ...item,
    title: cleanHeadlineText(item.title),
    titleZh: knownTranslations.get(item.url) || knownTranslations.get(item.googleNewsUrl) || item.titleZh || '',
  }));
  const translatedItems = await addChineseTranslations(prepared, 450, { strict: false });
  const output = translatedItems.flatMap((translated, index) => {
    if (containsChinese(translated.titleZh) || containsChinese(translated.title)) return [polishChineseTitle(translated)];
    const item = items[index];
    const fallback = previousBySource.get(item.sourceKey) || baselineBySource.get(item.sourceKey);
    if (fallback && containsChinese(fallback.titleZh) && isAcceptableHeadline(item.category, fallback.title, fallback.url)) {
      console.warn(`${item.source} translation failed; kept its previous translated headline as explicit cache.`);
      return [polishChineseTitle(cachedMetadata({ ...fallback, category: item.category, source: item.source, sourceKey: item.sourceKey, sourceOrder: item.sourceOrder }))];
    }
    console.warn(`${item.source} translation failed and no translated fallback was usable; source omitted.`);
    return [];
  });
  if (output.length === 10) return output;
  const category = items[0]?.category;
  const previous = [...previousBySource.values()]
    .filter((item) => item.category === category && (containsChinese(item.title) || containsChinese(item.titleZh)))
    .sort((left, right) => Number(left.sourceOrder) - Number(right.sourceOrder))
    .slice(0, 10);
  if (previous.length === 10) {
    console.warn(`${category} refresh produced only ${output.length}/10 translated items; reused the previous translated Top 10.`);
    return previous.map((item) => polishChineseTitle(cachedMetadata(item)));
  }
  return output;
}

function techTokens(title) {
  return new Set(cleanHeadlineText(title).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff+.-]+/g, ' ').split(/\s+/)
    .filter((token) => token.length > 2 && !TECH_STOP_WORDS.has(token)));
}
function sameTechEvent(left, right) {
  if (isSimilarTitle(left, right)) return true;
  const a = techTokens(left); const b = techTokens(right);
  if (!a.size || !b.size) return false;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  const ratio = shared / Math.min(a.size, b.size);
  return shared >= 3 && ratio >= 0.38;
}
function techImpact(title) {
  const text = String(title || '').toLowerCase();
  return Math.min(32, TECH_IMPACT_KEYWORDS.reduce((score, keyword) => score + (text.includes(keyword) ? 4 : 0), 0));
}
function rankTechClusters(candidates, now) {
  const clusters = [];
  for (const item of candidates.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))) {
    let cluster = clusters.find((entry) => entry.items.some((other) => sameTechEvent(item.title, other.title)));
    if (!cluster) { cluster = { items: [] }; clusters.push(cluster); }
    cluster.items.push(item);
  }
  return clusters.map((cluster) => {
    const sourceCount = new Set(cluster.items.map((item) => item.sourceKey)).size;
    const representative = [...cluster.items].sort((a, b) => b.authority - a.authority || Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))[0];
    const freshestHours = Math.min(...cluster.items.map((item) => hoursOld(item.publishedAt, now)));
    const freshness = Math.max(0, 48 - freshestHours);
    const authority = Math.max(...cluster.items.map((item) => item.authority || 20));
    const score = Math.round((sourceCount * 34 + freshness * 1.15 + authority + techImpact(representative.title)) * 10) / 10;
    return { representative, sourceCount, score };
  }).sort((a, b) => b.score - a.score || Date.parse(b.representative.publishedAt || 0) - Date.parse(a.representative.publishedAt || 0));
}
async function collectTechSource(source, sourceOrder, now, baselineBySource) {
  if (source.special === 'hacker-news') {
    const item = baselineBySource.get('hacker-news');
    if (!item || !isAcceptableHeadline('tech', item.title, item.url)) return [];
    return [{ ...normalizeBaselineFreshness(item, now), category: 'tech', source: source.name, sourceKey: source.key, sourceOrder, authority: source.authority }];
  }
  const found = [];
  try {
    const feed = await fetchOfficialFeed(source, 'tech', now, TECH_WINDOW_HOURS);
    found.push(...feed.slice(0, TECH_ITEMS_PER_SOURCE));
  } catch (error) { console.warn(`${source.name} feed failed: ${error.message}`); }
  try {
    const lead = await readSectionLead(source, 'tech');
    const publishedAt = await publishedAtForLead(lead, source, 'tech', now);
    if (!publishedAt || hoursOld(publishedAt, now) <= TECH_WINDOW_HOURS) {
      found.unshift({ category: 'tech', title: lead.title, url: lead.url, publishedAt, source: source.name, sourceKey: source.key, feedRank: -1, score: 0 });
    }
  } catch (error) { console.warn(`${source.name} lead failed: ${error.message}`); }
  const unique = [];
  for (const item of found) {
    if (!item.url || unique.some((old) => old.url === item.url || isSimilarTitle(old.title, item.title))) continue;
    unique.push({ ...freshMetadata(item, now), source: source.name, sourceKey: source.key, sourceOrder, authority: source.authority });
    if (unique.length >= TECH_ITEMS_PER_SOURCE) break;
  }
  return unique;
}
async function collectTechTop10(now, baselineBySource, knownTranslations, previousBySource) {
  const batches = await Promise.all(TECH_SOURCES.map((source, index) => collectTechSource(source, index, now, baselineBySource)));
  const candidates = batches.flat().filter((item) => isAcceptableHeadline('tech', item.title, item.url));
  const ranked = rankTechClusters(candidates, now).slice(0, 10).map((cluster, rank) => ({
    ...cluster.representative,
    category: 'tech',
    sourceKey: `tech-event-${rank + 1}`,
    sourceOrder: rank,
    score: cluster.score,
    engagement: cluster.sourceCount >= 2 ? `${cluster.sourceCount}家科技媒体交叉确认` : '单一来源',
  }));
  console.log(`Tech aggregation: ${TECH_SOURCES.length} sources, ${candidates.length} candidates, ${ranked.length} ranked events.`);
  return translateItems(ranked, knownTranslations, previousBySource, baselineBySource);
}

async function fetchSectionSource(source, category, sourceOrder, now) {
  const lead = await readSectionLead(source, category);
  const publishedAt = await publishedAtForLead(lead, source, category, now);
  if (publishedAt && hoursOld(publishedAt, now) > FEED_FALLBACK_MAX_AGE_HOURS) throw new Error(`${source.name} section lead is stale (${Math.round(hoursOld(publishedAt, now))}h old)`);
  return freshMetadata({ category, title: lead.title, url: lead.url, source: source.name, sourceKey: source.key, sourceOrder, publishedAt, feedRank: 0, score: 0, engagement: '' }, now);
}
async function collectSection(category, now, previousBySource, baselineBySource, knownTranslations) {
  const results = await Promise.all(NEWS_SOURCES[category].map(async (source, sourceOrder) => {
    if (source.special) {
      const baseline = baselineBySource.get(source.key) || previousBySource.get(source.key);
      return baseline && isAcceptableHeadline(category, baseline.title, baseline.url)
        ? normalizeBaselineFreshness({ ...baseline, category, source: source.name, sourceKey: source.key, sourceOrder }, now)
        : null;
    }
    try { return await fetchSectionSource(source, category, sourceOrder, now); }
    catch (pageError) {
      try {
        const [feedItem] = await fetchOfficialFeed(source, category, now);
        if (feedItem) {
          console.warn(`${source.name} section page failed; used its official feed: ${pageError.message}`);
          return freshMetadata({ ...feedItem, category, source: source.name, sourceKey: source.key, sourceOrder, engagement: '' }, now);
        }
      } catch {}
      const fallback = previousBySource.get(source.key) || baselineBySource.get(source.key);
      if (fallback && isAcceptableHeadline(category, fallback.title, fallback.url)) {
        console.warn(`${source.name} failed; kept its previous cached headline: ${pageError.message}`);
        return cachedMetadata({ ...fallback, category, source: source.name, sourceKey: source.key, sourceOrder });
      }
      console.warn(`${source.name} failed and no category-safe cached fallback was usable; source omitted: ${pageError.message}`);
      return null;
    }
  }));
  return translateItems(results.filter(Boolean), knownTranslations, previousBySource, baselineBySource);
}
async function main() {
  const archivePath = String(process.env.HOT_NEWS_ARCHIVE_PATH || 'site/data/recent.json').trim(); const now = Date.now();
  const knownTranslations = archivedTitleTranslations(archivePath); const knownGoogleNewsUrls = archivedGoogleNewsUrls(archivePath); const previousBySource = archivedSourceItems(archivePath);
  const skipYouTube = environmentFlag(process.env.HOT_NEWS_SKIP_YOUTUBE);
  const baseline = await collectHotNews(0, now, knownTranslations, knownGoogleNewsUrls, previousBySource);
  const baselineBySource = new Map([...(baseline.tech || []), ...(baseline.market || []), ...(baseline.world || []), ...(baseline.youtube || [])].filter((item) => item.sourceKey).map((item) => [item.sourceKey, item]));
  const [tech, market] = await Promise.all([
    collectTechTop10(now, baselineBySource, knownTranslations, previousBySource),
    collectSection('market', now, previousBySource, baselineBySource, knownTranslations),
  ]);
  const world = (baseline.world || []).map((item) => normalizeBaselineFreshness(item, now)).map(polishChineseTitle);
  const youtube = skipYouTube
    ? [...previousBySource.values()]
      .filter((item) => item.category === 'youtube')
      .sort((left, right) => Number(left.sourceOrder) - Number(right.sourceOrder))
      .slice(0, 10)
    : (baseline.youtube || []).map((item) => normalizeBaselineFreshness(item, now)).map(polishChineseTitle);
  let trends = baseline.trends || [];
  try { trends = (await collectSocialWordCloud([...tech, ...market, ...world], now)).trends; }
  catch (error) { console.warn(`Event cloud refresh failed; kept the baseline cloud: ${error.message}`); }
  const cachedCount = [...tech, ...market, ...world, ...youtube].filter((item) => item.isCached).length;
  const news = { tech, market, world, youtube, trends, failureCount: cachedCount, fetchedAt: new Date(now).toISOString() };
  const archive = saveNewsArchive(news, archivePath, now, (item) => item.category === 'youtube' || !isPaywalledItem(item));
  console.log(`Saved current reader snapshot: ${archive.items.length} items; cached fallbacks=${cachedCount}; updated=${archive.updatedAt}.`);
  if (!environmentFlag(process.env.HOT_NEWS_REFRESH_ONLY)) console.log('refresh-reader-news.js is intended for reader refresh mode; no email was sent.');
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { TECH_SOURCES, cleanHeadlineText, collectTechTop10, hasReadableHeadlineShape, isClearlyNonTechHeadline, parseSectionHeadline, polishChineseTitle, rankTechClusters, sameTechEvent };
