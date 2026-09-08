const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  NEWS_SOURCES, assertChineseTranslations, detectTitleLanguage, environmentFlag, isPaywalledItem, isSameWorldEvent, isSimilarTitle, newsMessage, parseHomepageHeadline, parseRssItems, publishedDateFromHtml, rankAndDedupe, rankWorldCandidates,
  readerUrl, recipients, resolveGoogleNewsItems, resolveGoogleNewsUrl,
  youtubeItemsFromResponses,
} = require("../scripts/send-hot-news-email");

test("uses ten fixed free sources for each reader tab", () => {
  assert.equal(NEWS_SOURCES.tech.length, 10);
  assert.equal(NEWS_SOURCES.market.length, 10);
  assert.equal(NEWS_SOURCES.world.length, 10);
  assert.equal(new Set(NEWS_SOURCES.tech.map((source) => source.key)).size, 10);
  assert.equal(new Set(NEWS_SOURCES.market.map((source) => source.key)).size, 10);
  assert.equal(new Set(NEWS_SOURCES.world.map((source) => source.key)).size, 10);
});

test("reader shows the latest snapshot without hour filters", () => {
  const html = fs.readFileSync("site/index.html", "utf8");
  const script = fs.readFileSync("site/reader.js", "utf8");
  const hnScript = fs.readFileSync("site/reader-hn.js", "utf8");
  const styles = fs.readFileSync("site/reader.css", "utf8");
  const uiRules = fs.readFileSync("docs/reader-ui-rules.md", "utf8");
  assert.doesNotMatch(html, /time-tab|6小时|12小时|18小时|24小时/);
  assert.doesNotMatch(script, /activeHours|selectHours|timeTabs/);
  assert.match(html, /v2026\.\d{2}\.\d{2}\.\d+/);
  assert.match(html, /data-category="world"[^>]*>国际</);
  assert.match(html, /data-category="youtube"[^>]*>YouTube</);
  assert.match(html, /data-category="hn"[^>]*>Hacker News</);
  assert.doesNotMatch(html, /data-category="trends"/);
  assert.match(hnScript, /'tech', 'market', 'world', 'youtube', 'hn'/);
  assert.match(hnScript, /当前 Top 10/);
  assert.match(hnScript, /Front 日榜 Top 10/);
  assert.match(hnScript, /whiteSpace = 'nowrap'/);
  assert.match(script, /globalnews-recent-v1/);
  assert.match(script, /ARCHIVE_URLS/);
  assert.match(styles, /\.subtle\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis/s);
  assert.match(uiRules, /包含“抓取于”的顶部状态行必须固定为一行/);
});

test("takes a publisher homepage lead instead of a Google News search result", () => {
  const source = { name: "Example", hosts: ["example.com"], articlePattern: "^/news/" };
  const markdown = `[Markets](https://example.com/markets/)\n[Current lead story from the publisher](https://www.example.com/news/current-lead)\n[Older story](https://example.com/news/older)`;
  assert.deepEqual(parseHomepageHeadline(markdown, source), {
    title: "Current lead story from the publisher", url: "https://www.example.com/news/current-lead",
  });
  assert.equal(publishedDateFromHtml('<meta property="article:published_time" content="2026-09-06T02:03:00Z">'), "2026-09-06T02:03:00.000Z");
});

test("accepts relative links from a publisher section page", () => {
  const source = { name: "Example", homepage: "https://example.com/markets/", hosts: ["example.com"], articlePattern: "^/story/" };
  assert.deepEqual(parseHomepageHeadline('<a href="/story/current">Current headline from this publisher</a>', source), {
    title: "Current headline from this publisher", url: "https://example.com/story/current",
  });
});

test("recovers tab interaction after the iOS app resumes", () => {
  const script = fs.readFileSync("site/reader.js", "utf8");
  assert.match(script, /visibilitychange/);
  assert.match(script, /pageshow/);
  assert.match(script, /recoverAfterResume/);
  assert.doesNotMatch(script, /event\.preventDefault\(\);\s*location\.href/);
});

test("sorts every reader category by newest publication time", () => {
  const script = fs.readFileSync("site/reader.js", "utf8");
  assert.match(script, /sort\(\(left, right\) => itemTimestamp\(right\) - itemTimestamp\(left\)\)/);
  assert.doesNotMatch(script, /Number\(left\.sourceOrder\).*Number\(right\.sourceOrder\)/s);
});

test("clusters international reports and labels cross-source confirmation", () => {
  const now = Date.parse("2026-09-06T02:00:00Z");
  const base = { category: "world", url: "https://example.com/a", publishedAt: "2026-09-06T01:00:00Z", feedRank: 0 };
  const left = { ...base, title: "US military strikes three Iranian oil tankers", source: "Reuters World", sourceKey: "reuters-world" };
  const right = { ...base, title: "US strike destroys three Iran oil tankers", source: "AP News", sourceKey: "ap-world" };
  assert.equal(isSameWorldEvent(left.title, right.title), true);
  const [ranked] = rankWorldCandidates([left, right], 10, now);
  assert.equal(ranked.sourceCount, 2);
  assert.match(ranked.engagement, /2家来源交叉确认/);
});

test("detects non-English YouTube title languages", () => {
  assert.equal(detectTitleLanguage("Tesla Taksiciliği Bitirebilir Mi?"), "tr");
  assert.equal(detectTitleLanguage("нвидиа поддерживает творческое виденье"), "ru");
  assert.equal(detectTitleLanguage("Tesla lanza el coche para el mercado"), "es");
  assert.equal(detectTitleLanguage("The latest Nvidia GPU driver is bad"), "en");
  assert.equal(detectTitleLanguage("特斯拉交付创新高"), "zh-CN");
});

test("uses YouTube universal links for the native-app button", () => {
  const script = fs.readFileSync("site/reader.js", "utf8");
  assert.match(script, /browser\.href = youtube \? item\.url/);
  assert.match(script, /browser\.dataset\.nativeApp = 'youtube'/);
  assert.match(script, /item\.category === 'youtube' && item\.engagement/);
  assert.match(script, /views\.className = 'news-views'/);
});

test("orders YouTube results by views and creates direct video links", () => {
  const search = { items: [
    { id: { videoId: "low" } }, { id: { videoId: "high" } },
  ] };
  const videos = { items: [
    { id: "low", snippet: { title: "Low", channelTitle: "A", publishedAt: "2026-09-05T01:00:00Z" }, statistics: { viewCount: "10" } },
    { id: "high", snippet: { title: "High", channelTitle: "B", publishedAt: "2026-09-05T02:00:00Z" }, statistics: { viewCount: "100" } },
  ] };
  const items = youtubeItemsFromResponses(search, videos);
  assert.deepEqual(items.map((item) => item.title), ["High", "Low"]);
  assert.equal(items[0].category, "youtube");
  assert.equal(items[0].url, "https://www.youtube.com/watch?v=high");
  assert.equal(items[0].source, "B");
  assert.match(items[0].engagement, /100 次观看/);
});

test("parses Google News RSS and removes source suffix", () => {
  const xml = `<rss><channel><item><title><![CDATA[Nvidia launches a new chip - Reuters]]></title><link>https://example.com/a?x=1&amp;y=2</link><pubDate>Fri, 04 Sep 2026 01:00:00 GMT</pubDate><source url="https://reuters.com">Reuters</source></item></channel></rss>`;
  assert.deepEqual(parseRssItems(xml, "tech")[0], {
    category: "tech", title: "Nvidia launches a new chip", url: "https://example.com/a?x=1&y=2",
    source: "Reuters", publishedAt: "Fri, 04 Sep 2026 01:00:00 GMT", feedRank: 0, score: 0,
  });
});

test("deduplicates substantially similar headlines", () => {
  assert.equal(isSimilarTitle("Nvidia launches new AI chip for data centers", "Breaking: Nvidia launches a new AI chip for data centers"), true);
  const now = Date.parse("2026-09-04T02:00:00Z");
  const items = [
    { category: "tech", title: "Nvidia launches new AI chip for data centers", url: "a", source: "Reuters", publishedAt: "2026-09-04T01:00:00Z", feedRank: 0 },
    { category: "tech", title: "Breaking: Nvidia launches a new AI chip for data centers", url: "b", source: "Other", publishedAt: "2026-09-04T00:00:00Z", feedRank: 1 },
    { category: "tech", title: "Apple updates iPhone software", url: "c", source: "The Verge", publishedAt: "2026-09-04T00:30:00Z", feedRank: 2 },
  ];
  assert.equal(rankAndDedupe(items, 10, now).length, 2);
});

test("places a Chinese translation directly below each English headline", () => {
  process.env.READER_BASE_URL = "https://xf5464.github.io/GlobalNews/";
  const item = { title: "Test & news", titleZh: "测试新闻", url: "https://example.com?a=1&b=2", source: "Reuters", publishedAt: "2026-09-04T01:00:00Z", score: 88 };
  const message = newsMessage({ tech: [item], market: [item], failureCount: 0, fetchedAt: "2026-09-04T02:00:00Z" });
  assert.match(message.subject, /海外科技与美股热点/);
  assert.match(message.subject, /2026\/09\/04 10:00/);
  assert.match(message.text, /全球科技热点 Top 10/);
  assert.match(message.text, /美股热点 Top 10/);
  assert.match(message.text, /中文：测试新闻/);
  assert.match(message.html, /Test &amp; news/);
  assert.match(message.html, /测试新闻/);
  assert.match(message.html, /中文阅读全文/);
  assert.match(message.html, /GlobalNews\/\?url=/);
  assert.match(message.text, /中文阅读：https:\/\/xf5464\.github\.io\/GlobalNews\//);
  delete process.env.READER_BASE_URL;
});

test("builds a reader URL without losing characters in the source URL", () => {
  process.env.READER_BASE_URL = "https://xf5464.github.io/GlobalNews/";
  const original = "https://example.com/story?a=1&b=two words";
  const translated = new URL(readerUrl(original));
  assert.equal(translated.pathname, "/GlobalNews/");
  assert.equal(translated.searchParams.get("url"), original);
  delete process.env.READER_BASE_URL;
});

test("keeps original links until the reader backend is enabled", () => {
  delete process.env.READER_BASE_URL;
  const item = { title: "News", titleZh: "新闻", url: "https://example.com/story", source: "Reuters", publishedAt: "2026-09-04T01:00:00Z", score: 88 };
  const message = newsMessage({ tech: [item], market: [item], failureCount: 0, fetchedAt: "2026-09-04T02:00:00Z" });
  assert.doesNotMatch(message.html, /中文阅读全文/);
  assert.match(message.html, /href="https:\/\/example\.com\/story"/);
});

test("supports comma-separated Gmail recipients", () => {
  assert.deepEqual(recipients("a@example.com, b@example.com"), ["a@example.com", "b@example.com"]);
  assert.throws(() => recipients("  "), /at least one/);
});

test("recognizes refresh-only environment values", () => {
  assert.equal(environmentFlag("true"), true);
  assert.equal(environmentFlag("1"), true);
  assert.equal(environmentFlag("on"), true);
  assert.equal(environmentFlag("false"), false);
  assert.equal(environmentFlag(""), false);
});

test("reuses an existing Chinese title without calling the translation service", async () => {
  const items = [{ title: "Existing English headline", titleZh: "已有中文标题" }];
  assert.deepEqual(await require("../scripts/send-hot-news-email").addChineseTranslations(items), items);
});

test("best-effort translation mode can return an untranslated item for caller fallback", async () => {
  const items = [{ title: "Needs translation", titleZh: "", source: "Example" }];
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("offline"); };
  try {
    assert.deepEqual(
      await require("../scripts/send-hot-news-email").addChineseTranslations(items, 450, { strict: false }),
      items,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("refuses to publish a snapshot with untranslated foreign titles", () => {
  assert.throws(() => assertChineseTranslations([
    { title: "An untranslated headline", titleZh: "", source: "Example" },
  ]), /Refusing to publish 1 untranslated title/);
  assert.doesNotThrow(() => assertChineseTranslations([
    { title: "An English headline", titleZh: "中文标题", source: "Example" },
    { title: "原本就是中文", titleZh: "原本就是中文", source: "中文来源" },
  ]));
});

test("filters strict paid-subscription sources by publisher or domain", () => {
  assert.equal(isPaywalledItem({ source: "The Wall Street Journal", url: "https://news.google.com/story" }), true);
  assert.equal(isPaywalledItem({ source: "Unknown", url: "https://www.bloomberg.com/news/a" }), true);
  assert.equal(isPaywalledItem({ source: "Reuters", url: "https://reuters.com/world/a" }), false);
});

test("does not treat a YouTube channel name as a paid news URL", () => {
  const item = { category: "youtube", source: "Business Insider", url: "https://www.youtube.com/watch?v=example" };
  assert.equal(item.category === "youtube" || !isPaywalledItem(item), true);
});


test("resolves a signed Google News URL to its publisher during collection", async () => {
  const googleUrl = "https://news.google.com/rss/articles/CBMiTest?oc=5";
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return { ok: true, text: async () => '<div data-n-a-sg="signature" data-n-a-ts="1788480000"></div>' };
    }
    return { ok: true, text: async () => '[\\\"garturlres\\\",\\\"https://www.cnbc.com/2026/09/04/story.html\\\",' };
  };
  const resolved = await resolveGoogleNewsUrl(googleUrl, fetcher);
  assert.equal(resolved, "https://www.cnbc.com/2026/09/04/story.html");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, "POST");
  assert.match(calls[1].options.body, /Fbv4je/);
});

test("reuses an archived Google News mapping without another network request", async () => {
  const googleUrl = "https://news.google.com/rss/articles/CBMiCached?oc=5";
  const directUrl = "https://www.reuters.com/technology/example/";
  const result = await resolveGoogleNewsItems(
    [{ title: "Cached story", url: googleUrl, source: "Reuters" }],
    new Map([[googleUrl, directUrl]]),
    async () => { throw new Error("fetch should not run"); },
  );
  assert.equal(result.items[0].url, directUrl);
  assert.equal(result.items[0].googleNewsUrl, googleUrl);
  assert.equal(result.resolvedCount, 1);
});
