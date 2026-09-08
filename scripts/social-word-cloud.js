const crypto = require('node:crypto');

const CLOUD_SIZE = 24;
const EVENT_LOOKBACK_HOURS = 72;
const EVENT_VERBS = /(起诉|发布|推出|上线|宣布|裁员|收购|批准|禁用|调查|袭击|攻击|会晤|会谈|通过|发射|部署|撤回|辞职|任命|判处|飙升|上涨|下跌|增长|下降|创.*新高|刷新.*纪录|达成|签署|制裁|停火|起飞|首飞|获批|开放|关闭|接管|管理|摧毁|离开|撤离|被捕|获释|当选|辞任|禁售|停售|召回|停产|量产|交付|扩产|融资|上市|破产|重组|举行|确认|拒绝|同意|推迟|取消|恢复|暂停)/;
const IMPACT_WORDS = /(战争|导弹|无人机|油轮|航母|洪水|地震|火灾|死亡|死刑|关税|贸易|利率|降息|加息|失业|通胀|铜价|油价|股价|出货量|CEO|首席执行官|火箭|轨道|GPU|芯片|诉讼|制裁|选举|总统|首相|政府|央行|美联储)/i;
const NON_EVENT = /(如何|how to|最佳|best |购买|buy |优惠|deal|折扣|省钱|观看|watch |直播|live stream|评测|review|教程|guide|值得买吗|盘点|推荐|不要扔掉|把它变成|强烈反弹|开放的|original link|store|商城)/i;

const MAINSTREAM_EVENT_SOURCES = [
  { key: 'reuters', name: 'Reuters', query: 'site:reuters.com when:2d' },
  { key: 'ap', name: 'AP News', query: 'site:apnews.com when:2d' },
  { key: 'bbc', name: 'BBC News', query: 'site:bbc.com/news when:2d' },
  { key: 'cnn', name: 'CNN', query: 'site:cnn.com when:2d' },
  { key: 'nbc', name: 'NBC News', query: 'site:nbcnews.com when:2d' },
  { key: 'abc', name: 'ABC News', query: 'site:abcnews.go.com when:2d' },
  { key: 'cbs', name: 'CBS News', query: 'site:cbsnews.com when:2d' },
  { key: 'sky', name: 'Sky News', query: 'site:news.sky.com when:2d' },
  { key: 'guardian', name: 'The Guardian', query: 'site:theguardian.com when:2d' },
  { key: 'independent', name: 'The Independent', query: 'site:independent.co.uk when:2d' },
];

function stripHtml(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function cleanEventLabel(value = '') {
  let text = stripHtml(value)
    .replace(/^【[^】]+】\s*/, '')
    .replace(/^[-–—:：\s]+/, '')
    .replace(/[“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  text = text
    .replace(/^塔斯社报道[，,:：\s]*/i, '')
    .replace(/^路透社报道[，,:：\s]*/i, '')
    .replace(/^美联社报道[，,:：\s]*/i, '')
    .replace(/^据[^，,]{2,12}报道[，,:：\s]*/i, '')
    .replace(/以下是.*$/i, '')
    .replace(/这里是.*$/i, '')
    .replace(/最新出版物$/i, '')
    .replace(/对此感到震惊.*$/i, '')
    .replace(/点击.*$/i, '')
    .replace(/\s*[-—–]\s*.*$/i, '')
    .trim();
  const clauses = text.split(/[。！？!?；;]/).map((part) => part.trim()).filter(Boolean);
  if (clauses.length > 1) text = clauses.find((part) => EVENT_VERBS.test(part) || IMPACT_WORDS.test(part)) || clauses[0];
  if (text.length > 22) {
    const parts = text.split(/[，,:：]/).map((part) => part.trim()).filter(Boolean);
    const eventPart = parts.find((part) => EVENT_VERBS.test(part) || IMPACT_WORDS.test(part));
    if (eventPart && eventPart.length >= 7) text = eventPart;
    else if (parts[0]?.length >= 8) text = parts[0];
  }
  if (text.length > 22) text = `${text.slice(0, 21)}…`;
  return text;
}

function titleTokens(value = '') {
  const normalized = String(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').replace(/\s+/g, ' ').trim();
  const latin = normalized.split(' ').filter((token) => token.length > 2);
  const chinese = normalized.match(/[\u4e00-\u9fff]{2,6}/g) || [];
  return new Set([...latin, ...chinese]);
}

function sameEvent(left, right) {
  const a = titleTokens(left); const b = titleTokens(right);
  if (!a.size || !b.size) return false;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared >= 2 && shared / Math.min(a.size, b.size) >= 0.35;
}

function freshnessScore(value, now) {
  const parsed = Date.parse(value || '');
  if (!Number.isFinite(parsed)) return 0;
  const ageHours = Math.max(0, (now - parsed) / 3_600_000);
  return Math.max(0, EVENT_LOOKBACK_HOURS - ageHours) * 0.9;
}

function isConcreteEvent(item, label) {
  const sourceText = `${item.titleZh || ''} ${item.title || ''}`;
  if (NON_EVENT.test(sourceText) || NON_EVENT.test(label)) return false;
  if (EVENT_VERBS.test(label) || EVENT_VERBS.test(sourceText)) return true;
  if (IMPACT_WORDS.test(label) || IMPACT_WORDS.test(sourceText)) return true;
  if (/\d/.test(label) && /(增长|下降|上涨|下跌|裁员|死亡|获利|亏损|出货|销量|营收|利润|失业|通胀)/.test(sourceText)) return true;
  return false;
}

function eligibleRecentItems(items, now) {
  return (items || []).filter((item) => {
    if (!item || item.category === 'youtube' || !(item.titleZh || item.title)) return false;
    const parsed = Date.parse(item.publishedAt || '');
    return !Number.isFinite(parsed) || (now - parsed) / 3_600_000 <= EVENT_LOOKBACK_HOURS;
  });
}

function buildEventCloud(items = [], now = Date.now(), limit = CLOUD_SIZE) {
  const usable = eligibleRecentItems(items, now);
  const ranked = usable.map((item) => {
    const related = usable.filter((other) => other !== item && sameEvent(item.title || item.titleZh, other.title || other.titleZh));
    const sources = new Set([item.source, ...related.map((other) => other.source)].filter(Boolean));
    const base = Math.min(100, Math.max(0, Number(item.score) || 0));
    const label = cleanEventLabel(item.titleZh || item.title);
    return {
      item, label,
      score: base * 0.3 + freshnessScore(item.publishedAt, now) + sources.size * 16 + related.length * 7,
      mentions: related.length + 1,
      platformCount: sources.size,
      platforms: [...sources],
    };
  }).filter((entry) => entry.label.length >= 6 && isConcreteEvent(entry.item, entry.label));
  ranked.sort((a, b) => b.score - a.score || b.platformCount - a.platformCount);
  const selected = [];
  for (const entry of ranked) {
    if (selected.some((chosen) => sameEvent(chosen.item.title || chosen.item.titleZh, entry.item.title || entry.item.titleZh))) continue;
    selected.push(entry);
    if (selected.length >= limit) break;
  }
  return selected.map((entry) => ({
    id: crypto.createHash('sha1').update(entry.label).digest('hex').slice(0, 10),
    term: entry.label, labelZh: entry.label, score: Math.round(entry.score * 100) / 100,
    mentions: entry.mentions, platformCount: entry.platformCount, platforms: entry.platforms,
    url: entry.item.url || '', category: 'mainstream',
  }));
}

function buildHeadlineFallback(items = [], now = Date.now(), limit = CLOUD_SIZE) {
  const usable = eligibleRecentItems(items, now)
    .filter((item) => !NON_EVENT.test(`${item.titleZh || ''} ${item.title || ''}`))
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  const selected = [];
  for (const item of usable) {
    const label = cleanEventLabel(item.titleZh || item.title);
    if (label.length < 6) continue;
    if (selected.some((entry) => sameEvent(entry.original, item.title || item.titleZh))) continue;
    selected.push({ item, label, original: item.title || item.titleZh });
    if (selected.length >= limit) break;
  }
  return selected.map(({ item, label }, index) => ({
    id: crypto.createHash('sha1').update(`fallback:${label}`).digest('hex').slice(0, 10),
    term: label,
    labelZh: label,
    score: Math.max(1, 100 - index * 3) + freshnessScore(item.publishedAt, now),
    mentions: 1,
    platformCount: 1,
    platforms: [item.source || '综合新闻'],
    url: item.url || '',
    category: 'mainstream',
  }));
}

function googleNewsUrl(query) {
  const params = new URLSearchParams({ q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' });
  return `https://news.google.com/rss/search?${params}`;
}

async function fetchText(url, timeoutMs = 15000, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { headers: { 'user-agent': 'Mozilla/5.0 GlobalNews/1.0', accept: 'application/rss+xml,text/xml,text/plain,*/*', 'accept-language': 'en-US,en;q=0.9' }, signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return response.text();
  } finally { clearTimeout(timer); }
}

function tagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? stripHtml(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')) : '';
}

function parseMainstreamRss(xml, source) {
  const blocks = String(xml).match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return blocks.slice(0, 10).map((block, index) => {
    const rawTitle = tagValue(block, 'title');
    const sourceMatch = block.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);
    const actualSource = sourceMatch ? stripHtml(sourceMatch[1]) : source.name;
    const suffix = actualSource && rawTitle.endsWith(` - ${actualSource}`) ? ` - ${actualSource}` : '';
    return {
      category: 'mainstream',
      title: suffix ? rawTitle.slice(0, -suffix.length) : rawTitle,
      titleZh: '',
      url: tagValue(block, 'link'),
      source: actualSource || source.name,
      sourceKey: `${source.key}-${index}`,
      sourceOrder: index,
      publishedAt: tagValue(block, 'pubDate'),
      score: Math.max(1, 100 - index * 5),
    };
  }).filter((item) => item.title && item.url);
}

async function translateToChinese(title, fetcher = fetch) {
  if (/\p{Script=Han}/u.test(title)) return title;
  const params = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: 'zh-CN', dt: 't', q: title });
  const text = await fetchText(`https://translate.googleapis.com/translate_a/single?${params}`, 15000, fetcher);
  const payload = JSON.parse(text);
  const translated = (payload?.[0] || []).map((part) => part?.[0] || '').join('').trim();
  return translated || title;
}

async function fetchMainstreamEventItems(now = Date.now(), fetcher = fetch) {
  const settled = await Promise.allSettled(MAINSTREAM_EVENT_SOURCES.map(async (source) => {
    const xml = await fetchText(googleNewsUrl(source.query), 15000, fetcher);
    return parseMainstreamRss(xml, source);
  }));
  const items = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    .filter((item) => {
      const parsed = Date.parse(item.publishedAt || '');
      return !Number.isFinite(parsed) || (now - parsed) / 3_600_000 <= EVENT_LOOKBACK_HOURS;
    });
  if (items.length < 10) throw new Error(`Mainstream event sources returned only ${items.length} usable stories.`);
  const candidates = items.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0)).slice(0, 45);
  const translated = [];
  for (let index = 0; index < candidates.length; index += 5) {
    const batch = candidates.slice(index, index + 5);
    const results = await Promise.all(batch.map(async (item) => {
      try { return { ...item, titleZh: await translateToChinese(item.title, fetcher) }; }
      catch { return { ...item, titleZh: item.title }; }
    }));
    translated.push(...results);
  }
  return translated;
}

function termsFromText(text) {
  const lower = String(text || '').toLowerCase();
  const terms = [];
  const add = (value) => { if (value && !terms.includes(value)) terms.push(value); };
  if (/\bopenai\b/.test(lower)) add('OpenAI');
  if (/\bnvidia\b/.test(lower)) add('英伟达');
  if (/\brubin\b/.test(lower)) add('Rubin');
  if (/\bclaude\b/.test(lower)) add('Claude');
  for (const match of String(text || '').match(/\bGPT\s*-?\s*\d+(?:\.\d+)*\b/gi) || []) add(match.replace(/\s+/g, '').replace(/^gpt/i, 'GPT'));
  return terms;
}

function buildWordCloud(signals, now = Date.now(), limit = CLOUD_SIZE) {
  const aggregate = new Map();
  for (const item of (signals || []).filter((signal) => signal?.platform !== 'YouTube')) {
    for (const term of termsFromText(item.text || '')) {
      const key = term.toLowerCase();
      if (!aggregate.has(key)) aggregate.set(key, { term, score: 0, mentions: 0, platforms: new Set(), url: item.url || '' });
      const entry = aggregate.get(key);
      entry.mentions += 1;
      entry.platforms.add(item.platform || 'source');
      entry.score += 1 + Math.log10(1 + Number(item.engagement || 0));
    }
  }
  return [...aggregate.values()].map((entry) => ({
    id: crypto.createHash('sha1').update(entry.term).digest('hex').slice(0, 10),
    term: entry.term,
    score: Math.round((entry.score + entry.platforms.size * 5) * 100) / 100,
    mentions: entry.mentions,
    platformCount: entry.platforms.size,
    platforms: [...entry.platforms],
    url: entry.url,
  })).sort((a, b) => b.score - a.score).slice(0, limit);
}

async function collectSocialWordCloud(baseItems = [], now = Date.now(), fetcher = fetch) {
  try {
    const mainstream = await fetchMainstreamEventItems(now, fetcher);
    const trends = buildEventCloud(mainstream, now);
    if (trends.length >= 8) {
      const names = [...new Set(mainstream.map((item) => item.source).filter(Boolean))];
      return { trends, sources: names.map((name) => ({ name, count: mainstream.filter((item) => item.source === name).length })), signalCount: mainstream.length };
    }
  } catch (error) {
    console.warn(`Mainstream event fetch failed; using current international headlines: ${error.message}`);
  }

  const worldItems = (baseItems || []).filter((item) => item?.category === 'world');
  let trends = buildEventCloud(worldItems, now);
  if (trends.length < 8) trends = buildHeadlineFallback(worldItems, now);
  if (trends.length < 8) trends = buildHeadlineFallback((baseItems || []).filter((item) => item?.category !== 'youtube'), now);
  if (!trends.length) throw new Error('Event cloud fallback also returned no usable headlines.');
  const names = [...new Set(worldItems.map((item) => item.source).filter(Boolean))];
  return { trends, sources: names.map((name) => ({ name, count: worldItems.filter((item) => item.source === name).length })), signalCount: worldItems.length };
}

module.exports = {
  MAINSTREAM_EVENT_SOURCES, buildEventCloud, buildHeadlineFallback, buildWordCloud, cleanEventLabel, collectSocialWordCloud,
  fetchMainstreamEventItems, parseMainstreamRss, stripHtml, termsFromText,
};
