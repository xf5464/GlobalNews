const USER_AGENT = "GlobalNews/1.0 (+https://github.com/xf5464/GlobalNews)";
const MAX_ITEMS = 10;
const MAX_HEADLINE_AGE_HOURS = 24 * 7;
const YOUTUBE_LOOKBACK_HOURS = 24;
const YOUTUBE_QUERY = '"artificial intelligence"|"technology news"|"stock market"|"Wall Street"|Nvidia|Tesla -movie -film -trailer -music';
const fs = require("node:fs");
const { saveNewsArchive } = require('./hot-news-archive');
const { collectSocialWordCloud } = require('./social-word-cloud');

const NEWS_SOURCES = {
  tech: [
    { key: "techradar", name: "TechRadar", homepage: "https://www.techradar.com/", headlineFeed: "https://www.techradar.com/rss", hosts: ["techradar.com"], articlePattern: "^/.+" },
    { key: "techcrunch", name: "TechCrunch", homepage: "https://techcrunch.com/", headlineFeed: "https://techcrunch.com/feed/", hosts: ["techcrunch.com"], articlePattern: "^/\\d{4}/\\d{2}/\\d{2}/" },
    { key: "the-verge", name: "The Verge", homepage: "https://www.theverge.com/tech", headlineFeed: "https://www.theverge.com/rss/index.xml", hosts: ["theverge.com"], articlePattern: "^/(news|tech|ai-artificial-intelligence)/" },
    { key: "ars-technica", name: "Ars Technica", homepage: "https://arstechnica.com/", headlineFeed: "https://feeds.arstechnica.com/arstechnica/index", hosts: ["arstechnica.com"], articlePattern: "^/[a-z-]+/\\d{4}/\\d{2}/" },
    { key: "engadget", name: "Engadget", homepage: "https://www.engadget.com/", headlineFeed: "https://www.engadget.com/rss.xml", hosts: ["engadget.com"], articlePattern: "^/.+" },
    { key: "techspot", name: "TechSpot", homepage: "https://www.techspot.com/", headlineFeed: "https://www.techspot.com/backend.xml", hosts: ["techspot.com"], articlePattern: "^/news/" },
    { key: "pcmag", name: "PCMag", homepage: "https://www.pcmag.com/news", headlineFeed: "https://www.pcmag.com/feeds/rss/latest", hosts: ["pcmag.com"], articlePattern: "^/(news|how-to|reviews)/" },
    { key: "bleepingcomputer", name: "BleepingComputer", homepage: "https://www.bleepingcomputer.com/", headlineFeed: "https://www.bleepingcomputer.com/feed/", hosts: ["bleepingcomputer.com"], articlePattern: "^/news/" },
    { key: "toms-hardware", name: "Tom's Hardware", homepage: "https://www.tomshardware.com/", headlineFeed: "https://www.tomshardware.com/feeds/all", hosts: ["tomshardware.com"], articlePattern: "^/.+" },
    { key: "hacker-news", name: "Hacker News", special: "hacker-news" },
  ],
  market: [
    { key: "guardian-business", name: "The Guardian Business", homepage: "https://www.theguardian.com/business", headlineFeed: "https://www.theguardian.com/business/rss", hosts: ["theguardian.com"], articlePattern: "^/business/" },
    { key: "yahoo-finance", name: "Yahoo Finance", homepage: "https://finance.yahoo.com/news/", headlineFeed: "https://finance.yahoo.com/rss/topstories", hosts: ["finance.yahoo.com"], articlePattern: "^/(news|markets)/.+\\.html$" },
    { key: "cnbc-markets", name: "CNBC Markets", homepage: "https://www.cnbc.com/markets/", headlineFeed: "https://www.cnbc.com/id/100003114/device/rss/rss.html", hosts: ["cnbc.com"], articlePattern: "^/\\d{4}/\\d{2}/\\d{2}/" },
    { key: "bbc-business", name: "BBC Business", homepage: "https://www.bbc.com/news/business", headlineFeed: "https://feeds.bbci.co.uk/news/business/rss.xml", hosts: ["bbc.com", "bbc.co.uk"], articlePattern: "^/news/" },
    { key: "cnn-business", name: "CNN Business", homepage: "https://www.cnn.com/business", hosts: ["cnn.com"], articlePattern: "^/\\d{4}/" },
    { key: "marketwatch", name: "MarketWatch", homepage: "https://www.marketwatch.com/markets", headlineFeed: "https://feeds.marketwatch.com/marketwatch/topstories/", hosts: ["marketwatch.com"], articlePattern: "^/story/" },
    { key: "benzinga", name: "Benzinga", homepage: "https://www.benzinga.com/markets", headlineFeed: "https://www.benzinga.com/feed", hosts: ["benzinga.com"], articlePattern: "^/(markets|news|trading-ideas)/" },
    { key: "the-street", name: "TheStreet", homepage: "https://www.thestreet.com/markets", headlineFeed: "https://www.thestreet.com/.rss/full/", hosts: ["thestreet.com"], articlePattern: "^/.+" },
    { key: "motley-fool", name: "The Motley Fool", homepage: "https://www.fool.com/investing-news/", headlineFeed: "https://www.fool.com/feeds/index.aspx?id=foolwatch&format=rss2", hosts: ["fool.com"], articlePattern: "^/investing/\\d{4}/\\d{2}/\\d{2}/" },
    { key: "ap-business", name: "AP Business", homepage: "https://apnews.com/hub/business", hosts: ["apnews.com"], articlePattern: "^/article/" },
  ],
  world: [
    { key: "reuters-world", name: "Reuters World", query: "site:reuters.com/world when:7d" },
    { key: "ap-world", name: "AP News", query: "site:apnews.com world when:7d" },
    { key: "bbc-world", name: "BBC News", query: "site:bbc.com/news world when:7d" },
    { key: "al-jazeera", name: "Al Jazeera", query: "site:aljazeera.com/news when:7d" },
    { key: "dw-world", name: "DW", query: "site:dw.com/en when:7d" },
    { key: "france24", name: "France 24", query: "site:france24.com/en when:7d" },
    { key: "guardian-world", name: "The Guardian", query: "site:theguardian.com/world when:7d" },
    { key: "npr-world", name: "NPR", query: "site:npr.org/sections/world when:7d" },
    { key: "cnn-world", name: "CNN", query: "site:cnn.com world when:7d" },
    { key: "un-news", name: "UN News", query: "site:news.un.org/en when:7d" },
  ],
};

const SOURCE_WEIGHTS = new Map(
  Object.values(NEWS_SOURCES).flat().map((source, index) => [source.name, 30 - index]),
);

const PAYWALL_SOURCE_NAMES = [
  "the wall street journal", "bloomberg", "financial times", "barron's",
  "the new york times", "the economist", "the information",
  "business insider", "fortune", "seeking alpha", "investor's business daily",
];
const PAYWALL_HOSTS = [
  "wsj.com", "bloomberg.com", "ft.com", "barrons.com", "nytimes.com",
  "economist.com", "theinformation.com", "businessinsider.com",
  "fortune.com", "seekingalpha.com", "investors.com",
];

function isPaywalledItem(item) {
  const source = String(item?.source || "").trim().toLowerCase();
  if (PAYWALL_SOURCE_NAMES.some((name) => source.includes(name))) return true;
  try {
    const host = new URL(item?.url || "").hostname.toLowerCase().replace(/^www\./, "");
    return PAYWALL_HOSTS.some((blocked) => host === blocked || host.endsWith("." + blocked));
  } catch {
    return false;
  }
}

function requiredEnvironment(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function recipients(value) {
  const result = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!result.length) throw new Error("ALERT_EMAIL_TO must contain at least one email address.");
  return result;
}

function decodeXml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripTags(value = "") {
  return decodeXml(String(value)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripTags(match[1]) : "";
}

function parseRssItems(xml, category, feedRank = 0) {
  const blocks = String(xml).match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return blocks.map((block, index) => {
    const sourceMatch = block.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);
    const source = sourceMatch ? stripTags(sourceMatch[1]) : "Google News";
    const rawTitle = tagValue(block, "title");
    const sourceSuffix = source && rawTitle.endsWith(` - ${source}`) ? ` - ${source}` : "";
    return {
      category,
      title: sourceSuffix ? rawTitle.slice(0, -sourceSuffix.length) : rawTitle,
      url: tagValue(block, "link"),
      source,
      publishedAt: tagValue(block, "pubDate"),
      feedRank: feedRank + index,
      score: 0,
    };
  }).filter((item) => item.title && item.url);
}

function normalizeTitle(title) {
  return String(title).toLowerCase()
    .replace(/\b(live|update|updates|breaking|exclusive|analysis)\b/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleTokens(title) {
  return new Set(normalizeTitle(title).split(" ").filter((token) => token.length > 2));
}

function isSimilarTitle(left, right) {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (!a.size || !b.size) return normalizeTitle(left) === normalizeTitle(right);
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size) >= 0.72;
}

function hoursOld(date, now = Date.now()) {
  const timestamp = typeof date === "number" ? date : Date.parse(date);
  return Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 3_600_000) : 999;
}

function keywordScore(title, category) {
  const text = String(title).toLowerCase();
  const keywords = category === "market"
    ? ["stock", "shares", "wall street", "nasdaq", "s&p", "dow", "earnings", "fed", "market", "investor"]
    : ["ai", "chip", "software", "technology", "tech", "robot", "cloud", "security", "startup", "semiconductor"];
  return Math.min(18, keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 3 : 0), 0));
}

function rankGoogleItem(item, now = Date.now()) {
  const freshness = Math.max(0, 28 - hoursOld(item.publishedAt, now));
  const source = SOURCE_WEIGHTS.get(item.source) || 12;
  const position = Math.max(0, 18 - item.feedRank * 0.3);
  return Math.round((freshness + source + position + keywordScore(item.title, item.category)) * 10) / 10;
}

function rankAndDedupe(items, limit = MAX_ITEMS, now = Date.now()) {
  const ranked = items
    .map((item) => ({ ...item, score: item.score || rankGoogleItem(item, now) }))
    .sort((a, b) => b.score - a.score || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const result = [];
  for (const item of ranked) {
    if (!result.some((chosen) => isSimilarTitle(chosen.title, item.title))) result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

const WORLD_STOP_WORDS = new Set([
  "about", "after", "against", "amid", "from", "into", "over", "says", "that", "their", "this", "with",
  "world", "news", "latest", "live", "update", "breaking", "report", "reports", "could", "would", "have", "has",
]);
const WORLD_IMPACT_KEYWORDS = [
  "attack", "strike", "war", "military", "missile", "nuclear", "sanction", "ceasefire", "election", "president",
  "government", "iran", "israel", "russia", "ukraine", "china", "taiwan", "oil", "tanker", "shipping", "energy",
  "earthquake", "flood", "disaster", "killed", "crisis", "tariff", "trade",
];

function worldEventTokens(title) {
  return new Set(normalizeTitle(title).split(" ")
    .filter((token) => token.length > 2 && !WORLD_STOP_WORDS.has(token)));
}

function isSameWorldEvent(left, right) {
  const a = worldEventTokens(left);
  const b = worldEventTokens(right);
  if (!a.size || !b.size) return normalizeTitle(left) === normalizeTitle(right);
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared >= 2 && shared / Math.min(a.size, b.size) >= 0.42;
}

function rankWorldCandidates(items, limit = MAX_ITEMS, now = Date.now()) {
  const ranked = items.map((item) => {
    const related = items.filter((candidate) => isSameWorldEvent(item.title, candidate.title));
    const sourceCount = new Set(related.map((candidate) => candidate.sourceKey || candidate.source)).size;
    const lower = item.title.toLowerCase();
    const impact = Math.min(30, WORLD_IMPACT_KEYWORDS.reduce((sum, keyword) => sum + (lower.includes(keyword) ? 4 : 0), 0));
    const freshness = Math.max(0, 48 - hoursOld(item.publishedAt, now));
    const authority = SOURCE_WEIGHTS.get(item.source) || 16;
    const score = Math.round((freshness * 1.4 + sourceCount * 18 + impact + authority - item.feedRank * 0.15) * 10) / 10;
    return {
      ...item, score, sourceCount,
      engagement: sourceCount >= 2 ? `${sourceCount}家来源交叉确认` : "单一来源，待确认",
    };
  }).sort((a, b) => b.score - a.score || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const selected = [];
  for (const item of ranked) {
    if (!selected.some((chosen) => isSameWorldEvent(chosen.title, item.title))) selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected.map((item, sourceOrder) => ({
    ...item, sourceKey: `world-${item.sourceKey}-${sourceOrder}`, sourceOrder,
  }));
}

async function fetchText(url, timeoutMs = 15_000) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/json;q=0.9, */*;q=0.8" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url, timeoutMs = 15_000, fetcher = fetch) {
  const response = await fetcher(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    throw new Error(`${url} returned ${detail}`);
  }
  return payload;
}

function isGoogleNewsUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === "news.google.com" || host.endsWith(".news.google.com");
  } catch {
    return false;
  }
}

async function resolveGoogleNewsUrl(rawUrl, fetcher = fetch) {
  if (!isGoogleNewsUrl(rawUrl)) return rawUrl;
  const target = new URL(rawUrl);
  const articleId = target.pathname.split("/").filter(Boolean).at(-1);
  if (!articleId) throw new Error("Google News article ID is missing.");

  const requestOptions = {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
      accept: "text/html",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(10_000),
  };
  const pageResponse = await fetcher("https://news.google.com/articles/" + encodeURIComponent(articleId), requestOptions);
  if (!pageResponse.ok) throw new Error(`Google News decode page returned HTTP ${pageResponse.status}`);
  const html = await pageResponse.text();
  const signature = html.match(/data-n-a-sg=["']([^"']+)["']/)?.[1];
  const timestamp = html.match(/data-n-a-ts=["']([^"']+)["']/)?.[1];
  if (!signature || !timestamp) throw new Error("Google News decode parameters are missing.");

  const requestValue = JSON.stringify([
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    articleId,
    Number(timestamp),
    signature,
  ]);
  const response = await fetcher("https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      referer: "https://news.google.com/",
      "user-agent": requestOptions.headers["user-agent"],
    },
    body: "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", requestValue]]])),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google News decode API returned HTTP ${response.status}`);
  const text = await response.text();
  const marker = '[\\\"garturlres\\\",\\\"';
  const offset = text.indexOf(marker);
  if (offset < 0) throw new Error("Google News did not return the publisher URL.");
  const escaped = text.slice(offset + marker.length).split('\\\",', 1)[0];
  let resolved;
  try { resolved = JSON.parse('"' + escaped + '"'); }
  catch { resolved = escaped.replaceAll("\\\\/", "/"); }
  if (!/^https?:\/\//i.test(resolved) || isGoogleNewsUrl(resolved)) {
    throw new Error("Google News returned an invalid publisher URL.");
  }
  return resolved;
}

async function resolveGoogleNewsItems(items, knownUrls = new Map(), fetcher = fetch, concurrency = 4) {
  const output = new Array(items.length);
  let cursor = 0;
  let resolvedCount = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (!isGoogleNewsUrl(item.url)) {
        output[index] = { ...item };
        continue;
      }
      const googleNewsUrl = item.url;
      const cached = knownUrls.get(googleNewsUrl);
      if (cached && !isGoogleNewsUrl(cached)) {
        output[index] = { ...item, url: cached, googleNewsUrl };
        resolvedCount += 1;
        continue;
      }
      try {
        const resolved = await resolveGoogleNewsUrl(googleNewsUrl, fetcher);
        output[index] = { ...item, url: resolved, googleNewsUrl };
        resolvedCount += 1;
      } catch (error) {
        console.warn(`Could not resolve Google News URL for "${item.title}": ${error.message}`);
        output[index] = { ...item, googleNewsUrl };
      }
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, () => worker());
  await Promise.all(workers);
  return { items: output, resolvedCount };
}

function googleNewsUrl(query) {
  const params = new URLSearchParams({ q: query, hl: "en-US", gl: "US", ceid: "US:en" });
  return `https://news.google.com/rss/search?${params}`;
}

async function fetchGoogleFeed(query, category, feedRank) {
  const xml = await fetchText(googleNewsUrl(query));
  return parseRssItems(xml, category, feedRank);
}

function cleanMarkdownTitle(value) {
  return decodeXml(String(value || ""))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[*_`#]/g, " ").replace(/\s+/g, " ").trim();
}

function parseHomepageHeadline(markdown, source) {
  const content = String(markdown || "");
  const markdownLinks = [...content.matchAll(/\[([^\]]+)\]\(([^\s)]+)[^)]*\)/g)]
    .map((match) => [match[1], match[2]]);
  const htmlLinks = [...content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => [stripTags(match[2]), match[1]]);
  const links = [...markdownLinks, ...htmlLinks];
  const pattern = source.articlePattern ? new RegExp(source.articlePattern, "i") : null;
  const blocked = /^(home|news|markets?|technology|tech|read more|view all|latest|subscribe|sign in|log in)$/i;
  for (const [rawTitle, rawUrl] of links) {
    const title = cleanMarkdownTitle(rawTitle);
    if (title.length < 15 || title.length > 240 || blocked.test(title)) continue;
    try {
      const url = new URL(decodeXml(rawUrl), source.homepage);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (!(source.hosts || []).some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) continue;
      if (pattern && !pattern.test(url.pathname)) continue;
      url.hash = "";
      return { title, url: url.toString() };
    } catch { /* Ignore malformed homepage links. */ }
  }
  throw new Error(`${source.name} homepage returned no usable lead story.`);
}

function publishedDateFromHtml(html) {
  const patterns = [
    /["']datePublished["']\s*:\s*["']([^"']+)["']/i,
    /property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const value = String(html || "").match(pattern)?.[1];
    if (value && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  }
  return "";
}

async function fetchHomepageHeadline(source, category, sourceOrder, now = Date.now()) {
  if (source.headlineFeed) {
    try {
      const feedItems = parseRssItems(await fetchText(source.headlineFeed, 15_000), category, 0)
        .filter((item) => !isPaywalledItem(item))
        .filter((item) => !item.publishedAt || hoursOld(item.publishedAt, now) <= MAX_HEADLINE_AGE_HOURS)
        .sort((left, right) => Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0));
      if (feedItems.length) {
        const item = feedItems[0];
        return {
          ...item, source: source.name, sourceKey: source.key, sourceOrder,
          score: rankGoogleItem({ ...item, source: source.name }, now),
        };
      }
    } catch (error) {
      console.warn(`${source.name} official feed failed; trying its section page: ${error.message}`);
    }
  }
  const homepage = new URL(source.homepage);
  let lead;
  try {
    lead = parseHomepageHeadline(await fetchText(source.homepage, 15_000), source);
  } catch (directError) {
    const readerUrl = `https://r.jina.ai/http://${homepage.host}${homepage.pathname}${homepage.search}`;
    try { lead = parseHomepageHeadline(await fetchText(readerUrl, 20_000), source); }
    catch (readerError) { throw new Error(`${directError.message}; reader fallback: ${readerError.message}`); }
  }
  let publishedAt = "";
  try { publishedAt = publishedDateFromHtml(await fetchText(lead.url, 10_000)); } catch { /* Try the index below. */ }
  if (!publishedAt) {
    const query = `site:${new URL(lead.url).hostname} "${lead.title.replaceAll('"', ' ')}" when:30d`;
    try {
      const indexed = await fetchGoogleFeed(query, category, 0);
      publishedAt = (indexed.find((item) => isSimilarTitle(item.title, lead.title)) || indexed[0])?.publishedAt || "";
    } catch { /* An unknown date is preferable to inventing one. */ }
  }
  return {
    category, title: lead.title, url: lead.url, source: source.name,
    sourceKey: source.key, sourceOrder, publishedAt,
    feedRank: 0, score: rankGoogleItem({ ...lead, source: source.name, category, publishedAt }, now),
  };
}

function containsChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value));
}

function detectTitleLanguage(title, hint = "") {
  const text = String(title || "");
  if (containsChinese(text)) return "zh-CN";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/[ğışçöüİ]/i.test(text)) return "tr";
  if (/[ăâîșț]/i.test(text)) return "ro";
  const lower = ` ${text.toLowerCase()} `;
  if (/\b(el|los|las|una|para|pero|del|mercado|acciones)\b/.test(lower)) return "es";
  if (/\b(le|les|des|avec|pour|marché|actions)\b/.test(lower)) return "fr";
  if (/\b(der|die|das|und|aktien|markt)\b/.test(lower)) return "de";
  if (/\b(não|uma|para|mercado|ações)\b/.test(lower)) return "pt";
  const base = String(hint || "").trim().toLowerCase().split(/[-_]/)[0];
  const aliases = { nb: "no", nn: "no", fil: "tl", iw: "he", id: "id" };
  return aliases[base] || base || "en";
}

async function translateTitle(title, sourceLanguage = "en") {
  if (!title || containsChinese(title)) return title;
  const [translated] = await translateBatch([title], sourceLanguage);
  return translated;
}

async function translateBatch(titles, sourceLanguage = "en") {
  const separator = "\n|||\n";
  const source = titles.join(separator);
  const params = new URLSearchParams({ q: source, langpair: `${sourceLanguage}|zh-CN`, mt: "1" });
  const payload = JSON.parse(await fetchText(`https://api.mymemory.translated.net/get?${params}`, 5_000));
  const translated = String(payload?.responseData?.translatedText || "").trim();
  if (!translated || Number(payload.responseStatus) !== 200) {
    throw new Error("Translation API returned no Chinese translation.");
  }
  const parts = translated.split(/\s*\|\|\|\s*/).map((item) => item.trim());
  if (parts.length !== titles.length) throw new Error("Translation API changed the batch separator.");
  return parts;
}

async function translateTitleFallback(title) {
  const params = new URLSearchParams({ client: "dict-chrome-ex", sl: "auto", tl: "zh-CN", q: title });
  const response = await fetch(`https://clients5.google.com/translate_a/t?${params}`, {
    signal: AbortSignal.timeout(5_000),
    headers: { "user-agent": "Mozilla/5.0", accept: "application/json,text/plain,*/*" },
  });
  if (!response.ok) throw new Error(`Chrome translation endpoint returned HTTP ${response.status}.`);
  const payload = await response.json();
  const translated = String(payload?.[0]?.[0] || "").trim();
  if (!translated || !containsChinese(translated)) throw new Error("Chrome translation endpoint returned no Chinese text.");
  return translated;
}

async function translateTitleLegacyFallback(title) {
  const params = new URLSearchParams({ client: "gtx", sl: "auto", tl: "zh-CN", dt: "t", q: title });
  const payload = JSON.parse(await fetchText(`https://translate.googleapis.com/translate_a/single?${params}`, 5_000));
  const translated = (payload?.[0] || []).map((part) => part?.[0] || "").join("").trim();
  if (!translated || !containsChinese(translated)) throw new Error("Automatic translation returned no Chinese text.");
  return translated;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function translateTitleWithRetry(title, attempts = 1) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await translateTitleFallback(title);
    } catch (primaryError) {
      try {
        return await translateTitleLegacyFallback(title);
      } catch (legacyError) {
        lastError = new Error(`Chrome endpoint: ${primaryError.message}; legacy endpoint: ${legacyError.message}`);
      }
      if (attempt < attempts) await wait(350 * attempt);
    }
  }
  throw lastError;
}

function assertChineseTranslations(items) {
  const missing = items.filter((item) => !containsChinese(item.title) && !containsChinese(item.titleZh));
  if (missing.length) {
    throw new Error(`Refusing to publish ${missing.length} untranslated title(s): ${missing.map((item) => item.source || item.title).join(", ")}`);
  }
  return items;
}

async function addChineseTranslations(items, maxBatchBytes = 450, { strict = true } = {}) {
  const output = items.map((item) => ({
    ...item,
    titleZh: String(item.titleZh || "").trim() || (containsChinese(item.title) ? item.title : ""),
  }));
  const groups = new Map();
  for (let index = 0; index < items.length; index += 1) {
    if (output[index].titleZh) continue;
    const language = detectTitleLanguage(items[index].title, items[index].language);
    if (!groups.has(language)) groups.set(language, []);
    groups.get(language).push(index);
  }
  async function translateIndexes(indexes, language) {
    try {
      const translations = await translateBatch(indexes.map((index) => items[index].title), language);
      if (translations.some((translation) => !containsChinese(translation))) throw new Error("Translation was not Chinese.");
      indexes.forEach((index, offset) => { output[index].titleZh = translations[offset]; });
    } catch (error) {
      await Promise.all(indexes.map(async (index) => {
        try { output[index].titleZh = await translateTitleWithRetry(items[index].title); }
        catch (fallbackError) {
          console.warn(`Could not translate title from ${language}: MyMemory: ${error.message}; Google fallback: ${fallbackError.message}`);
        }
      }));
    }
  }
  const translationJobs = [];
  for (const [language, indexes] of groups) {
    let batch = [];
    for (const index of indexes) {
      const candidate = [...batch, index];
      const bytes = Buffer.byteLength(candidate.map((itemIndex) => items[itemIndex].title).join("\n|||\n"), "utf8");
      if (batch.length && bytes > maxBatchBytes) {
        translationJobs.push(translateIndexes(batch, language));
        batch = [index];
      } else batch = candidate;
    }
    if (batch.length) translationJobs.push(translateIndexes(batch, language));
  }
  await Promise.all(translationJobs);
  return strict ? assertChineseTranslations(output) : output;
}

async function fetchHackerNewsTop(now = Date.now()) {
  const ids = JSON.parse(await fetchText("https://hacker-news.firebaseio.com/v0/topstories.json"));
  const stories = await Promise.all(ids.slice(0, 12).map(async (id) => {
    try {
      return JSON.parse(await fetchText(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, 8_000));
    } catch {
      return null;
    }
  }));
  const story = stories.find((entry) => entry && entry.type === "story" && entry.url);
  if (!story) throw new Error("Hacker News returned no usable story.");
  return {
    category: "tech", title: story.title, url: story.url, source: "Hacker News",
    sourceKey: "hacker-news", sourceOrder: 9,
    publishedAt: new Date(story.time * 1000).toISOString(), feedRank: 0,
    score: Math.round((Math.log2((story.score || 0) + 1) * 9 + Math.log2((story.descendants || 0) + 1) * 5 + Math.max(0, 24 - hoursOld(story.time * 1000, now))) * 10) / 10,
    engagement: `${story.score || 0} points · ${story.descendants || 0} comments`,
  };
}

function youtubeItemsFromResponses(searchPayload, videosPayload) {
  const searchOrder = new Map((searchPayload?.items || [])
    .map((item, index) => [item?.id?.videoId, index]).filter(([id]) => id));
  return (videosPayload?.items || []).map((video) => {
    const views = Number(video?.statistics?.viewCount || 0);
    const likes = Number(video?.statistics?.likeCount || 0);
    const comments = Number(video?.statistics?.commentCount || 0);
    return {
      category: "youtube",
      title: String(video?.snippet?.title || "").trim(),
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
      source: String(video?.snippet?.channelTitle || "YouTube").trim(),
      language: video?.snippet?.defaultAudioLanguage || video?.snippet?.defaultLanguage || "",
      sourceKey: `youtube-${video.id}`,
      sourceOrder: searchOrder.get(video.id) ?? 999,
      publishedAt: video?.snippet?.publishedAt || "",
      feedRank: searchOrder.get(video.id) ?? 999,
      score: views,
      engagement: `${views.toLocaleString("en-US")} 次观看`,
      views,
      likes,
      comments,
    };
  }).filter((item) => item.title && item.sourceKey !== "youtube-undefined")
    .sort((left, right) => right.views - left.views || right.likes - left.likes || right.comments - left.comments)
    .slice(0, MAX_ITEMS)
    .map((item, index) => ({ ...item, sourceOrder: index }));
}

async function fetchYouTubeTop(apiKey, now = Date.now(), fetcher = fetch) {
  if (!apiKey) throw new Error("Missing required environment variable: YOUTUBE_API_KEY");
  const publishedAfter = new Date(now - YOUTUBE_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const searchParams = new URLSearchParams({
    part: "snippet", type: "video", maxResults: "50", order: "viewCount",
    q: YOUTUBE_QUERY, publishedAfter, regionCode: "US", relevanceLanguage: "en",
    safeSearch: "moderate", key: apiKey,
  });
  const searchPayload = await fetchJson(`https://www.googleapis.com/youtube/v3/search?${searchParams}`, 15_000, fetcher);
  const videoIds = (searchPayload.items || []).map((item) => item?.id?.videoId).filter(Boolean);
  if (!videoIds.length) throw new Error("YouTube returned no recent videos.");
  const videoParams = new URLSearchParams({
    part: "snippet,statistics", id: videoIds.join(","), maxResults: "50", key: apiKey,
  });
  const videosPayload = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${videoParams}`, 15_000, fetcher);
  const items = youtubeItemsFromResponses(searchPayload, videosPayload);
  if (items.length < MAX_ITEMS) throw new Error(`YouTube returned only ${items.length}/${MAX_ITEMS} usable videos.`);
  return addChineseTranslations(items);
}

function archivedItems(filePath) {
  if (!filePath) return [];
  try {
    const archive = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(archive.items)) return archive.items;
    return (archive.days || []).flatMap((day) => day.items || []);
  } catch { return []; }
}

function archivedTitleTranslations(filePath) {
  return new Map(archivedItems(filePath).filter((item) => item.url && item.titleZh)
    .flatMap((item) => [[item.url, item.titleZh], ...(item.googleNewsUrl ? [[item.googleNewsUrl, item.titleZh]] : [])]));
}

function archivedGoogleNewsUrls(filePath) {
  return new Map(archivedItems(filePath)
    .filter((item) => item.googleNewsUrl && item.url && !isGoogleNewsUrl(item.url))
    .map((item) => [item.googleNewsUrl, item.url]));
}

function archivedSourceItems(filePath) {
  return new Map(archivedItems(filePath).filter((item) => item.sourceKey).map((item) => [item.sourceKey, item]));
}

async function fetchLatestSourceItem(source, category, sourceOrder, now = Date.now()) {
  if (source.special === "hacker-news") return fetchHackerNewsTop(now);
  return fetchHomepageHeadline(source, category, sourceOrder, now);
}

async function fetchWorldTop(now, knownTranslations, knownGoogleNewsUrls) {
  const settled = await Promise.allSettled(NEWS_SOURCES.world.map(async (source, sourceOrder) => {
    const items = await fetchGoogleFeed(source.query, "world", sourceOrder * 20);
    return items.slice(0, 10).map((item) => ({
      ...item, source: source.name, sourceKey: source.key, sourceOrder,
    }));
  }));
  const failures = settled.filter((result) => result.status === "rejected");
  const candidates = settled.flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter((item) => !isPaywalledItem(item) && hoursOld(item.publishedAt, now) <= 7 * 24);
  const ranked = rankWorldCandidates(candidates, MAX_ITEMS + 5, now);
  if (ranked.length < MAX_ITEMS) throw new Error(`International sources returned only ${ranked.length}/${MAX_ITEMS} unique stories.`);
  const resolved = await resolveGoogleNewsItems(ranked, knownGoogleNewsUrls);
  const free = resolved.items.filter((item) => !isPaywalledItem(item)).slice(0, MAX_ITEMS);
  if (free.length < MAX_ITEMS) throw new Error(`International sources returned only ${free.length}/${MAX_ITEMS} free stories.`);
  const translated = await addChineseTranslations(free.map((item) => ({
    ...item,
    titleZh: knownTranslations.get(item.url) || knownTranslations.get(item.googleNewsUrl) || "",
  })));
  return { items: translated, failureCount: failures.length, resolvedCount: resolved.resolvedCount };
}

async function collectHotNews(
  _windowHours,
  now = Date.now(),
  knownTranslations = new Map(),
  knownGoogleNewsUrls = new Map(),
  knownSourceItems = new Map(),
) {
  const jobs = ["tech", "market"].flatMap((category) => NEWS_SOURCES[category].map((source, sourceOrder) =>
    ({ category, source, sourceOrder })));
  const settled = await Promise.allSettled(jobs.map(({ source, category, sourceOrder }) =>
    fetchLatestSourceItem(source, category, sourceOrder, now)));
  let failureCount = 0;
  const candidates = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const job = jobs[index];
    const fallback = knownSourceItems.get(job.source.key);
    if (!fallback) {
      console.warn(`${job.source.name} failed and has no previous snapshot item: ${result.reason?.message || result.reason}`);
      return null;
    }
    failureCount += 1;
    console.warn(`${job.source.name} failed; reused its previous snapshot item: ${result.reason?.message || result.reason}`);
    return { ...fallback, category: job.category, source: job.source.name, sourceKey: job.source.key, sourceOrder: job.sourceOrder };
  }).filter(Boolean);
  const previousCategory = (category) => [...knownSourceItems.values()]
    .filter((item) => item.category === category)
    .sort((left, right) => Number(left.sourceOrder) - Number(right.sourceOrder))
    .slice(0, MAX_ITEMS);
  let techCandidates = candidates.filter((item) => item.category === "tech");
  let marketCandidates = candidates.filter((item) => item.category === "market");
  for (const category of ["tech", "market"]) {
    const current = category === "tech" ? techCandidates : marketCandidates;
    if (current.length === MAX_ITEMS) continue;
    const previous = previousCategory(category);
    if (previous.length !== MAX_ITEMS) {
      throw new Error(`Incomplete source snapshot: ${category}=${current.length}/${MAX_ITEMS}`);
    }
    failureCount += 1;
    console.warn(`${category} source snapshot was incomplete (${current.length}/${MAX_ITEMS}); reused the previous Top 10.`);
    if (category === "tech") techCandidates = previous;
    else marketCandidates = previous;
  }
  const [resolvedTech, resolvedMarket] = await Promise.all([
    resolveGoogleNewsItems(techCandidates, knownGoogleNewsUrls),
    resolveGoogleNewsItems(marketCandidates, knownGoogleNewsUrls),
  ]);
  const reuseTranslations = (items) => items.map((item) => ({
    ...item,
    titleZh: knownTranslations.get(item.url) || knownTranslations.get(item.googleNewsUrl) || "",
  }));
  const translateWithSnapshotFallback = async (items, category) => {
    const attempted = await addChineseTranslations(reuseTranslations(items), 450, { strict: false });
    const missing = attempted.filter((item) => !containsChinese(item.title) && !containsChinese(item.titleZh));
    if (!missing.length) return attempted;
    const previous = [...knownSourceItems.values()]
      .filter((item) => item.category === category && (containsChinese(item.title) || containsChinese(item.titleZh)))
      .sort((left, right) => Number(left.sourceOrder) - Number(right.sourceOrder))
      .slice(0, MAX_ITEMS);
    if (previous.length !== MAX_ITEMS) return assertChineseTranslations(attempted);
    failureCount += 1;
    console.warn(`${category} title translation failed for ${missing.length} item(s); reused the previous translated Top 10.`);
    return previous;
  };
  const [tech, market] = await Promise.all([
    translateWithSnapshotFallback(resolvedTech.items.sort((a, b) => a.sourceOrder - b.sourceOrder), "tech"),
    translateWithSnapshotFallback(resolvedMarket.items.sort((a, b) => a.sourceOrder - b.sourceOrder), "market"),
  ]);
  let youtube;
  try {
    youtube = await fetchYouTubeTop(String(process.env.YOUTUBE_API_KEY || "").trim(), now);
  } catch (error) {
    const previous = [...knownSourceItems.values()]
      .filter((item) => item.category === "youtube")
      .sort((left, right) => Number(left.sourceOrder) - Number(right.sourceOrder))
      .slice(0, MAX_ITEMS);
    if (previous.length !== MAX_ITEMS) throw error;
    failureCount += 1;
    youtube = previous;
    console.warn(`YouTube failed; reused the previous Top 10: ${error.message}`);
  }
  let world;
  let worldResolvedCount = 0;
  try {
    const result = await fetchWorldTop(now, knownTranslations, knownGoogleNewsUrls);
    world = result.items;
    failureCount += result.failureCount;
    worldResolvedCount = result.resolvedCount;
  } catch (error) {
    const previous = [...knownSourceItems.values()]
      .filter((item) => item.category === "world")
      .sort((left, right) => Number(left.sourceOrder) - Number(right.sourceOrder))
      .slice(0, MAX_ITEMS);
    if (previous.length !== MAX_ITEMS) throw error;
    failureCount += 1;
    world = previous;
    console.warn(`International news failed; reused the previous Top 10: ${error.message}`);
  }
  let trends = [];
  try {
    const cloud = await collectSocialWordCloud([...tech, ...market, ...world], now);
    trends = cloud.trends;
    console.log(`Built ${trends.length} word-cloud terms from ${cloud.signalCount} non-YouTube signals across ${cloud.sources.length} public sources.`);
  } catch (error) {
    console.warn(`Word cloud failed; the news snapshot will still update: ${error.message}`);
  }
  console.log(`Resolved ${resolvedTech.resolvedCount + resolvedMarket.resolvedCount + worldResolvedCount} Google News URL(s) before archiving.`);
  return { tech, market, world, youtube, trends, failureCount, fetchedAt: new Date(now).toISOString() };

  /* Previous cross-source ranking implementation retained in history.
  const requests = [
    fetchHackerNews(windowHours, now),
    fetchGoogleFeed("technology OR AI OR chips OR software when:1d", "tech", 0),
    fetchGoogleFeed('("stock market" OR "Wall Street" OR Nasdaq OR "S&P 500") when:1d', "market", 0),
    fetchGoogleFeed("(earnings OR shares OR stock) (Nvidia OR Apple OR Microsoft OR Amazon OR Meta OR Tesla OR Alphabet) when:1d", "market", 40),
  ];
  const settled = await Promise.allSettled(requests);
  const failures = settled.filter((result) => result.status === "rejected");
  const groups = settled.filter((result) => result.status === "fulfilled").map((result) => result.value);
  if (!groups.length) throw new Error("All hot-news sources failed.");
  const all = groups.flat().filter((item) =>
    hoursOld(item.publishedAt, now) <= windowHours && !isPaywalledItem(item));
  const candidateLimit = MAX_ITEMS + 8;
  const rankedTechCandidates = rankAndDedupe(all.filter((item) => item.category === "tech"), candidateLimit, now);
  const rankedMarketCandidates = rankAndDedupe(all.filter((item) => item.category === "market"), candidateLimit, now);
  const [resolvedTech, resolvedMarket] = await Promise.all([
    resolveGoogleNewsItems(rankedTechCandidates, knownGoogleNewsUrls),
    resolveGoogleNewsItems(rankedMarketCandidates, knownGoogleNewsUrls),
  ]);
  const rankedTech = resolvedTech.items.filter((item) => !isPaywalledItem(item)).slice(0, MAX_ITEMS);
  const rankedMarket = resolvedMarket.items.filter((item) => !isPaywalledItem(item)).slice(0, MAX_ITEMS);
  const reuseTranslations = (items) => items.map((item) => ({
    ...item,
    titleZh: knownTranslations.get(item.url) || knownTranslations.get(item.googleNewsUrl) || "",
  }));
  const [tech, market] = await Promise.all([
    addChineseTranslations(reuseTranslations(rankedTech)),
    addChineseTranslations(reuseTranslations(rankedMarket)),
  ]);
  if (!tech.length || !market.length) throw new Error(`Not enough news: tech=${tech.length}, market=${market.length}`);
  console.log(`Resolved ${resolvedTech.resolvedCount + resolvedMarket.resolvedCount} Google News URL(s) before archiving.`);
  return { tech, market, failureCount: failures.length, fetchedAt: new Date(now).toISOString() };
  */
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function formatChinaTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(date));
}

function triggerType() {
  const source = String(process.env.TRIGGER_SOURCE || "manual").trim().toLowerCase();
  return source === "cloudflare" ? "Cloudflare 定时" : "GitHub 手动触发";
}

function readerUrl(url) {
  const base = String(process.env.READER_BASE_URL || "").trim();
  if (!base) return "";
  const target = new URL(base);
  target.searchParams.set("url", url);
  return target.toString();
}

function itemText(item, index) {
  const extra = item.engagement ? `；${item.engagement}` : `；热度分 ${item.score}`;
  const translation = item.titleZh ? `\n   中文：${item.titleZh}` : "";
  const translatedUrl = readerUrl(item.url);
  const links = translatedUrl ? `中文阅读：${translatedUrl}\n   原文：${item.url}` : item.url;
  return `${index + 1}. ${item.title}${translation}\n   ${item.source} · ${formatChinaTime(item.publishedAt)}${extra}\n   ${links}`;
}

function itemHtml(item, index) {
  const extra = item.engagement ? item.engagement : `综合热度 ${item.score}`;
  const translation = item.titleZh ? `<div style="margin-top:4px;color:#344054;font-size:15px">${escapeHtml(item.titleZh)}</div>` : "";
  const translatedUrl = readerUrl(item.url);
  const action = translatedUrl ? `<div style="margin-top:8px"><a href="${escapeHtml(translatedUrl)}" style="display:inline-block;margin-right:12px;padding:5px 10px;border-radius:7px;background:#1558d6;color:#fff;font-size:13px;text-decoration:none">中文阅读全文</a><a href="${escapeHtml(item.url)}" style="color:#667085;font-size:13px;text-decoration:none">打开原文</a></div>` : "";
  return `<li style="margin:0 0 20px"><a href="${escapeHtml(translatedUrl || item.url)}" style="color:#1558d6;font-size:16px;font-weight:600;text-decoration:none">${escapeHtml(item.title)}</a>${translation}<div style="margin-top:5px;color:#667085;font-size:13px">${escapeHtml(item.source)} · ${escapeHtml(formatChinaTime(item.publishedAt))} · ${escapeHtml(extra)}</div>${action}</li>`;
}

function newsMessage(news) {
  const time = formatChinaTime(news.fetchedAt);
  const textSection = (title, items) => [title, "", ...items.map(itemText), ""].join("\n");
  const htmlSection = (title, items) => `<h2 style="margin:28px 0 14px;color:#101828">${title}</h2><ol style="padding-left:24px">${items.map(itemHtml).join("")}</ol>`;
  return {
    subject: `[GlobalNews] 海外科技与美股热点 Top 10｜${time}`,
    text: [
      `采集时间：${time}（北京时间）`, `触发方式：${triggerType()}`,
      "排序综合考虑发布时间、来源权威度、聚合位置；科技新闻同时参考 Hacker News 讨论热度。", "",
      textSection("全球科技热点 Top 10", news.tech), textSection("美股热点 Top 10", news.market),
      news.failureCount ? `备注：${news.failureCount} 个备用信息源本次不可用，邮件已使用其余来源生成。` : "",
    ].filter(Boolean).join("\n"),
    html: `<div style="max-width:760px;margin:auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#101828;line-height:1.55"><h1 style="margin-bottom:6px">海外科技与美股热点</h1><div style="color:#667085">${escapeHtml(time)}（北京时间） · ${escapeHtml(triggerType())}</div><p style="color:#475467">排序综合考虑发布时间、来源权威度、聚合位置；科技新闻同时参考 Hacker News 讨论热度。</p>${htmlSection("全球科技热点 Top 10", news.tech)}${htmlSection("美股热点 Top 10", news.market)}${news.failureCount ? `<p style="color:#b54708">${news.failureCount} 个备用信息源本次不可用，已自动降级。</p>` : ""}</div>`,
  };
}

function environmentFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

async function main() {
  const refreshOnly = environmentFlag(process.env.HOT_NEWS_REFRESH_ONLY);
  const archivePath = String(process.env.HOT_NEWS_ARCHIVE_PATH || "").trim();
  const news = await collectHotNews(
    0,
    Date.now(),
    archivedTitleTranslations(archivePath),
    archivedGoogleNewsUrls(archivePath),
    archivedSourceItems(archivePath),
  );
  if (refreshOnly) {
    if (!archivePath) throw new Error("HOT_NEWS_ARCHIVE_PATH is required in refresh-only mode.");
    const archive = saveNewsArchive(news, archivePath, Date.parse(news.fetchedAt), (item) =>
      item.category === "youtube" || !isPaywalledItem(item));
    console.log(`Saved latest reader snapshot: ${archive.items.length} item(s), updated ${archive.updatedAt}.`);
    console.log(`Reader refresh completed without email: tech=${news.tech.length}, market=${news.market.length}, world=${news.world.length}, youtube=${news.youtube.length}, trends=${news.trends.length}.`);
    return;
  }

  console.log("Email-only mode: reader archive was not modified.");

  const nodemailer = require("nodemailer");
  const username = requiredEnvironment("GMAIL_USERNAME");
  const password = requiredEnvironment("GMAIL_APP_PASSWORD").replace(/\s+/g, "");
  const to = recipients(requiredEnvironment("ALERT_EMAIL_TO"));
  const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: username, pass: password } });
  const result = await transport.sendMail({ from: username, to, ...newsMessage(news) });
  console.log(`Hot-news email accepted for ${result.accepted.length} recipient(s): tech=${news.tech.length}, market=${news.market.length}.`);
  if (result.rejected.length) throw new Error(`Email rejected for ${result.rejected.length} recipient(s).`);
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = {
  NEWS_SOURCES, addChineseTranslations, archivedGoogleNewsUrls, archivedSourceItems, archivedTitleTranslations, assertChineseTranslations, cleanMarkdownTitle, collectHotNews, decodeXml,
  detectTitleLanguage, environmentFlag, fetchYouTubeTop, isGoogleNewsUrl, isPaywalledItem, isSimilarTitle, newsMessage, normalizeTitle,
  isSameWorldEvent, parseHomepageHeadline, parseRssItems, publishedDateFromHtml, rankAndDedupe, rankWorldCandidates, readerUrl, recipients, resolveGoogleNewsItems, resolveGoogleNewsUrl,
  translateBatch, translateTitle, youtubeItemsFromResponses,
};
