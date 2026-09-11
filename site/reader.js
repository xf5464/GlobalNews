'use strict';

const API_ROOT = 'https://globalnews-reader.xf5464.workers.dev';
const ARCHIVE_URLS = [
  new URL('data/recent.json', location.href).toString(),
  'https://raw.githubusercontent.com/xf5464/GlobalNews/main/site/data/recent.json',
];
const ARCHIVE_CACHE_KEY = 'globalnews-recent-v1';
const ARTICLE_CACHE_KEY = 'globalnews-articles-v1';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const RESUME_REFRESH_MS = 5 * 60 * 1000;

const refs = {
  days: document.querySelector('#daysContainer'), empty: document.querySelector('#emptyArchive'),
  archiveMeta: document.querySelector('#archiveMeta'), tabs: [...document.querySelectorAll('.category-tab')],
  dialog: document.querySelector('#readerDialog'), close: document.querySelector('#closeDialog'),
  loading: document.querySelector('#loadingState'), article: document.querySelector('#article'),
  error: document.querySelector('#errorState'), title: document.querySelector('#articleTitle'),
  site: document.querySelector('#siteName'), meta: document.querySelector('#articleMeta'),
  body: document.querySelector('#articleBody'), source: document.querySelector('#footerSourceLink'),
  errorSource: document.querySelector('#errorSourceLink'), errorMessage: document.querySelector('#errorMessage'),
  retry: document.querySelector('#retryButton'), dialogFont: document.querySelector('#dialogFontButton'),
};

let archive = { schemaVersion: 2, updatedAt: null, refreshAttemptedAt: null, items: [] };
let archiveLoadedFromCache = false;
const savedCategory = localStorage.getItem('globalnews-reader-category');
let activeCategory = ['tech', 'market', 'world', 'youtube', 'trends'].includes(savedCategory) ? savedCategory : 'tech';
let currentUrl = '';
let backgroundedAt = 0;
let fontStep = Number(localStorage.getItem('globalnews-reader-font') || 1);
const fontSizes = [17, 19, 21, 23];

function jsonStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function chinaDate(value = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
function itemTimestamp(item) {
  const published = Date.parse(item?.publishedAt);
  if (Number.isFinite(published)) return published;
  const pushed = Date.parse(item?.pushedAt);
  return Number.isFinite(pushed) ? pushed : 0;
}
function sourceTimestamp(item) {
  const sourceUpdated = Date.parse(item?.sourceUpdatedAt);
  if (Number.isFinite(sourceUpdated)) return sourceUpdated;
  const fetched = Date.parse(item?.fetchedAt);
  return Number.isFinite(fetched) ? fetched : 0;
}
function pruneArchive(value) {
  const items = Array.isArray(value?.items) ? value.items : (value?.days || []).flatMap((day) => day.items || []);
  const bySource = new Map();
  items.forEach((item) => {
    const key = item.sourceKey || item.id || item.url;
    if (!key) return;
    const old = bySource.get(key);
    if (!old || itemTimestamp(item) > itemTimestamp(old)) bySource.set(key, item);
  });
  return {
    schemaVersion: 2,
    updatedAt: value?.updatedAt || null,
    refreshAttemptedAt: value?.refreshAttemptedAt || value?.updatedAt || null,
    categoryUpdatedAt: value?.categoryUpdatedAt && typeof value.categoryUpdatedAt === 'object' ? { ...value.categoryUpdatedAt } : {},
    categoryAttemptedAt: value?.categoryAttemptedAt && typeof value.categoryAttemptedAt === 'object' ? { ...value.categoryAttemptedAt } : {},
    failureCount: Number(value?.failureCount) || 0,
    items: [...bySource.values()],
    trends: Array.isArray(value?.trends) ? value.trends.slice(0, 30) : [],
  };
}
function pruneArticleCache() {
  const cached = jsonStorage(ARTICLE_CACHE_KEY, {});
  const cutoff = Date.now() - THREE_DAYS_MS;
  const next = Object.fromEntries(Object.entries(cached).filter(([, entry]) => Number(entry?.cachedAt || 0) >= cutoff && entry?.payload?.translatedText));
  localStorage.setItem(ARTICLE_CACHE_KEY, JSON.stringify(next));
  return next;
}
function categoryLabel(category) {
  return category === 'market' ? '美股' : category === 'world' ? '国际' : category === 'youtube' ? 'YouTube' : category === 'trends' ? '热点事件' : '科技';
}
function publishedTimeLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '时间未知';
  const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  const key = chinaDate(date);
  if (key === chinaDate()) return `今天 ${time}`;
  if (key === chinaDate(Date.now() - 86400000)) return `昨天 ${time}`;
  const day = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }).format(date);
  return `${day} ${time}`;
}
function updatedTimeLabel(value) { return value ? `抓取于 ${publishedTimeLabel(value)}` : '抓取时间未知'; }
function directArticleUrl(url) {
  try {
    const target = new URL(url);
    if (target.hostname === 'news.google.com' || target.hostname.endsWith('.news.google.com')) {
      const resolver = new URL('/open', API_ROOT); resolver.searchParams.set('url', target.toString()); return resolver.toString();
    }
  } catch { return url; }
  return url;
}
function chromeUrl(url) {
  if (url.startsWith('https://')) return `googlechromes://${url.slice(8)}`;
  if (url.startsWith('http://')) return `googlechrome://${url.slice(7)}`;
  return url;
}
function itemButton(item, rank) {
  const row = document.createElement('div'); row.className = 'news-row';
  const youtube = item.category === 'youtube';
  const content = document.createElement('div'); content.className = 'news-item news-item-static'; content.dataset.id = item.id || '';
  const number = document.createElement('span'); number.className = 'rank'; number.textContent = String(rank);
  const copy = document.createElement('span'); copy.className = 'news-copy';
  const translated = document.createElement('span'); translated.className = 'news-title'; translated.textContent = item.titleZh || item.title || '未命名新闻';
  const original = document.createElement('span'); original.className = 'news-original';
  original.textContent = item.titleZh && item.titleZh !== item.title ? (item.title || '') : '';
  copy.append(translated, original);
  if ((item.category === 'world' || item.category === 'tech') && item.engagement) { const note = document.createElement('span'); note.className = 'news-note'; note.textContent = item.engagement; copy.append(note); }
  const details = document.createElement('span'); details.className = 'news-details';
  const source = document.createElement('span'); source.className = 'news-source'; source.textContent = item.source || '来源未知';
  const published = document.createElement('span'); published.className = 'news-time'; published.textContent = ` · ${publishedTimeLabel(item.publishedAt)}`; details.append(source, published);
  if (item.category === 'youtube' && item.engagement) { const views = document.createElement('span'); views.className = 'news-views'; views.textContent = ` · ${item.engagement}`; details.append(views); }
  if (item.isCached) { const cache = document.createElement('span'); cache.className = 'news-cache'; cache.textContent = ` · 缓存 ${publishedTimeLabel(item.sourceUpdatedAt || item.fetchedAt)}`; details.append(cache); }
  copy.append(details);
  content.append(number, copy);
  const browser = document.createElement('a'); browser.className = 'safari-link';
  browser.href = youtube ? item.url : chromeUrl(directArticleUrl(item.url)); browser.textContent = '↗';
  browser.title = youtube ? '使用 YouTube 打开' : '使用 Chrome 打开';
  browser.setAttribute('aria-label', `${youtube ? '使用 YouTube 打开' : '使用 Chrome 打开'}：${translated.textContent}`);
  if (youtube) browser.dataset.nativeApp = 'youtube';
  row.append(content, browser); return row;
}
function updateCategoryTabs() {
  refs.tabs.forEach((tab) => { const selected = tab.dataset.category === activeCategory; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
}
function selectedItems(value) {
  const items = (value.items || []).filter((item) => item.category === activeCategory);
  if (activeCategory === 'tech') return items.sort((left, right) => Number(right.score || 0) - Number(left.score || 0)).slice(0, 10);
  return items.sort((left, right) => itemTimestamp(right) - itemTimestamp(left)).slice(0, 10);
}
function categoryFreshness(items, fromCache) {
  const sourceTimes = items.map(sourceTimestamp).filter((value) => value > 0);
  const latestSourceTime = sourceTimes.length ? Math.max(...sourceTimes) : Date.parse(archive.updatedAt || 0);
  const cachedItems = items.filter((item) => item.isCached);
  if (fromCache) return `网络加载失败 · 当前显示本地缓存 · 缓存时间 ${publishedTimeLabel(latestSourceTime)}`;
  if (items.length && cachedItems.length === items.length) return `本次抓取失败 · 当前显示缓存数据 · 缓存时间 ${publishedTimeLabel(latestSourceTime)}`;
  if (cachedItems.length) return `${updatedTimeLabel(latestSourceTime)} · ${cachedItems.length}条来源使用旧缓存`;
  return updatedTimeLabel(latestSourceTime);
}

function renderEventCloud(trends) {
  const panel = document.createElement('section'); panel.className = 'day word-cloud-panel';
  const cloud = document.createElement('div'); cloud.className = 'event-cloud'; cloud.setAttribute('role', 'list'); cloud.setAttribute('aria-label', '今日热点事件');
  const sorted = [...trends].sort((left, right) => Number(right.score) - Number(left.score));
  const scores = sorted.map((item) => Number(item.score) || 0);
  const min = Math.min(...scores); const max = Math.max(...scores);
  const colors = ['#175cd3', '#7f56d9', '#c4320a', '#087443', '#b54708', '#344054'];
  sorted.forEach((trend, index) => {
    const ratio = max === min ? 0.5 : (Number(trend.score) - min) / (max - min);
    const size = Math.round(15 + Math.sqrt(Math.max(0, ratio)) * 13);
    const link = document.createElement('a'); link.className = 'event-topic'; link.setAttribute('role', 'listitem');
    link.href = trend.url ? chromeUrl(directArticleUrl(trend.url)) : '#'; link.style.fontSize = `${size}px`; link.style.color = colors[index % colors.length];
    link.textContent = trend.labelZh || trend.term; link.title = `${link.textContent} · ${trend.platformCount || 1}家来源`;
    cloud.append(link);
  });
  const meta = document.createElement('p'); meta.className = 'cloud-meta';
  meta.textContent = '显示今天具体发生的事件，不再显示 AI、Google、云计算等泛词。字号综合新闻热度、来源交叉确认和发布时间；不包含 YouTube。';
  panel.append(cloud, meta); refs.days.append(panel);
}

function renderArchive(value, fromCache = false) {
  archive = pruneArchive(value); archiveLoadedFromCache = fromCache; localStorage.setItem(ARCHIVE_CACHE_KEY, JSON.stringify(archive)); refs.days.replaceChildren(); updateCategoryTabs();
  if (activeCategory === 'trends') {
    const trends = archive.trends || []; refs.empty.hidden = trends.length > 0;
    refs.archiveMeta.textContent = trends.length ? `热点事件 · ${trends.length}个事件 · ${fromCache ? '网络加载失败 · 当前显示本地缓存 · ' : ''}${updatedTimeLabel(archive.updatedAt)}` : '本次抓取暂无热点事件';
    if (trends.length) renderEventCloud(trends); return;
  }
  const items = selectedItems(archive); refs.empty.hidden = items.length > 0;
  const mode = activeCategory === 'tech' ? '17家优质科技来源综合热点前10' : activeCategory === 'youtube' ? '最近24小时热度前10' : activeCategory === 'world' ? '免费来源综合热点前10' : '每个网站当前头条';
  refs.archiveMeta.textContent = items.length ? `${categoryLabel(activeCategory)} · ${mode} · ${categoryFreshness(items, fromCache)}` : `本次抓取暂无${categoryLabel(activeCategory)}新闻`;
  if (!items.length) return;
  const section = document.createElement('section'); section.className = 'day'; const list = document.createElement('ol'); list.className = 'news-list';
  items.forEach((item, index) => { const li = document.createElement('li'); li.append(itemButton(item, index + 1)); list.append(li); }); section.append(list); refs.days.append(section);
}
function selectCategory(category) {
  if (!['tech', 'market', 'world', 'youtube', 'trends'].includes(category) || category === activeCategory) return;
  activeCategory = category; localStorage.setItem('globalnews-reader-category', category); renderArchive(archive, archiveLoadedFromCache);
  if (category === 'trends' ? !(archive.trends || []).length : !selectedItems(archive).length) loadArchive();
}
function recoverAfterResume() {
  document.documentElement.style.pointerEvents = ''; document.body.style.pointerEvents = ''; updateCategoryTabs();
  if (archive.items.length) renderArchive(archive, archiveLoadedFromCache);
  if (!archive.updatedAt || Date.now() - Date.parse(archive.updatedAt) >= RESUME_REFRESH_MS) loadArchive();
}
async function loadArchive() {
  const cached = pruneArchive(jsonStorage(ARCHIVE_CACHE_KEY, { items: [] }));
  const cachedUpdatedAt = Date.parse(cached.updatedAt || 0) || 0;
  let best = null;
  let bestUpdatedAt = 0;
  let lastError;
  for (const archiveUrl of ARCHIVE_URLS) {
    try {
      const target = new URL(archiveUrl); target.searchParams.set('v', String(Date.now()));
      const response = await fetch(target, { cache: 'no-store', headers: { 'cache-control': 'no-cache', pragma: 'no-cache' } });
      if (!response.ok) throw new Error(String(response.status));
      const next = await response.json(); if (!Array.isArray(next?.items)) throw new Error('数据格式错误');
      const nextUpdatedAt = Date.parse(next.updatedAt || 0) || 0;
      if (!best || nextUpdatedAt > bestUpdatedAt) { best = next; bestUpdatedAt = nextUpdatedAt; }
    } catch (error) { lastError = error; }
  }
  if (best && bestUpdatedAt >= cachedUpdatedAt) { renderArchive(best, false); return; }
  if (cached.items.length) {
    renderArchive(cached, true);
    if (best && bestUpdatedAt < cachedUpdatedAt) refs.archiveMeta.textContent += ' · 服务器返回的数据比本地缓存更旧，已拒绝降级';
    else if (lastError) refs.archiveMeta.textContent += ` · 加载失败（${lastError.message || '网络错误'}）`;
    return;
  }
  if (best) { renderArchive(best, false); return; }
  renderArchive(cached, true);
  refs.archiveMeta.textContent += ` · 加载失败，点击页签重试（${lastError?.message || '网络错误'}）`;
}
function showDialogState(name) { refs.loading.hidden = name !== 'loading'; refs.article.hidden = name !== 'article'; refs.error.hidden = name !== 'error'; }
function renderParagraphs(text) {
  refs.body.replaceChildren(); String(text || '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).forEach((paragraph) => { const element = document.createElement('p'); element.textContent = paragraph; refs.body.append(element); });
}
function renderArticle(payload, localCache = false) {
  refs.title.textContent = payload.titleZh || payload.title || '中文译文'; refs.site.textContent = payload.siteName || new URL(payload.url).hostname;
  const names = { direct: '原站', 'browser-run': '浏览器渲染', 'jina-reader': '阅读服务' };
  refs.meta.textContent = `${names[payload.extractionSource] || '网页'}提取 · Cloudflare Workers AI 翻译 · ${localCache || payload.cached ? '已读取缓存' : '刚刚生成'}`;
  refs.source.href = payload.url; renderParagraphs(payload.translatedText); showDialogState('article');
}
async function loadArticle(url, force = false) {
  currentUrl = url; refs.source.href = url; refs.errorSource.href = url; if (!refs.dialog.open) refs.dialog.showModal(); showDialogState('loading');
  const cache = pruneArticleCache(); if (!force && cache[url]?.payload) { renderArticle(cache[url].payload, true); return; }
  try {
    const endpoint = new URL('/reader-api', API_ROOT); endpoint.searchParams.set('url', url);
    const response = await fetch(endpoint, { headers: { accept: 'application/json' } }); const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `服务器返回 ${response.status}`); if (!payload.translatedText) throw new Error('没有提取到可阅读的文章正文。');
    cache[url] = { cachedAt: Date.now(), payload }; localStorage.setItem(ARTICLE_CACHE_KEY, JSON.stringify(cache)); renderArticle(payload);
  } catch (error) { refs.errorMessage.textContent = `${error.message} 你仍可打开英文原文。`; showDialogState('error'); }
}
function changeFont() { fontStep = (fontStep + 1) % fontSizes.length; localStorage.setItem('globalnews-reader-font', String(fontStep)); document.documentElement.style.setProperty('--reader-size', `${fontSizes[fontStep]}px`); }
refs.tabs[0]?.parentElement.addEventListener('click', (event) => { const tab = event.target.closest('.category-tab'); if (tab) selectCategory(tab.dataset.category); });
refs.retry.addEventListener('click', () => { if (currentUrl) loadArticle(currentUrl, true); }); refs.close.addEventListener('click', () => refs.dialog.close());
refs.dialog.addEventListener('click', (event) => { if (event.target === refs.dialog) refs.dialog.close(); }); refs.dialogFont.addEventListener('click', changeFont);
document.documentElement.style.setProperty('--reader-size', `${fontSizes[fontStep] || 19}px`);
document.addEventListener('visibilitychange', () => { if (document.hidden) { backgroundedAt = Date.now(); return; } if (backgroundedAt) recoverAfterResume(); backgroundedAt = 0; });
window.addEventListener('pageshow', (event) => { if (event.persisted || backgroundedAt) recoverAfterResume(); backgroundedAt = 0; });
pruneArticleCache(); loadArchive();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').then(async (registration) => {
    const subscription = await registration.pushManager?.getSubscription(); if (!subscription) return;
    await fetch(`${API_ROOT}/push/unsubscribe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription) }).catch(() => null); await subscription.unsubscribe();
  }).catch(() => {});
}
const initialUrl = new URL(location.href).searchParams.get('url'); if (initialUrl) loadArticle(initialUrl);
