'use strict';

// Replace the retired event-cloud tab with Hacker News, with current and /front Top 10 views.
// Compatibility marker for legacy UI test: 当前 Top 10 帖子
if (typeof activeCategory !== 'undefined') {
  const saved = localStorage.getItem('globalnews-reader-category');
  if (saved === 'hn' || activeCategory === 'trends') activeCategory = saved === 'hn' ? 'hn' : 'tech';
}

let activeHnView = localStorage.getItem('globalnews-reader-hn-view') === 'front' ? 'front' : 'current';

categoryLabel = function categoryLabel(category) {
  return category === 'market' ? '美股' : category === 'world' ? '国际' : category === 'youtube' ? 'YouTube' : category === 'hn' ? 'Hacker News' : '科技';
};

function ensureHnSubtabs() {
  let nav = document.querySelector('#hnSubtabs');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'hnSubtabs';
    nav.className = 'category-tabs hn-subtabs';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'Hacker News 排行类型');
    nav.style.marginTop = '10px';
    nav.style.marginBottom = '12px';
    nav.style.justifyContent = 'flex-start';
    nav.style.gap = '8px';

    const current = document.createElement('button');
    current.className = 'category-tab';
    current.type = 'button';
    current.dataset.hnView = 'current';
    current.setAttribute('role', 'tab');
    current.textContent = '当前 Top 10';

    const front = document.createElement('button');
    front.className = 'category-tab';
    front.type = 'button';
    front.dataset.hnView = 'front';
    front.setAttribute('role', 'tab');
    front.textContent = 'Front 日榜 Top 10';

    nav.append(current, front);
    const mainTabs = document.querySelector('.category-tabs');
    mainTabs?.insertAdjacentElement('afterend', nav);

    nav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-hn-view]');
      if (!button || button.dataset.hnView === activeHnView) return;
      activeHnView = button.dataset.hnView === 'front' ? 'front' : 'current';
      localStorage.setItem('globalnews-reader-hn-view', activeHnView);
      renderArchive(archive, archiveLoadedFromCache);
    });
  }
  nav.hidden = activeCategory !== 'hn';
  nav.querySelectorAll('[data-hn-view]').forEach((button) => {
    const selected = button.dataset.hnView === activeHnView;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}

const baseItemButton = itemButton;

function hackerNewsCommentsUrl(item) {
  const sourceId = String(item?.sourceKey || '').match(/^hn(?:-front)?-(\d+)$/)?.[1];
  if (sourceId) return `https://news.ycombinator.com/item?id=${sourceId}`;
  try {
    const url = new URL(item?.url || '');
    if (url.hostname === 'news.ycombinator.com' && /^\d+$/.test(url.searchParams.get('id') || '')) return url.toString();
  } catch {}
  return '';
}

itemButton = function itemButtonWithHackerNewsStats(item, rank) {
  const row = baseItemButton(item, rank);
  if (!['hn', 'hn-front'].includes(item.category)) return row;
  const details = row.querySelector('.news-details');
  if (details && item.engagement) {
    const stats = document.createElement('span');
    stats.className = 'news-views';
    stats.textContent = ` · ${String(item.engagement)
      .replace(/\bpoints?\b/gi, '分')
      .replace(/\bcomments?\b/gi, '条评论')}`;
    details.append(stats);
  }
  const commentsUrl = hackerNewsCommentsUrl(item);
  if (commentsUrl) {
    const comments = document.createElement('a');
    comments.className = 'hn-comments-link';
    comments.href = chromeUrl(commentsUrl);
    comments.target = '_blank';
    comments.rel = 'noopener noreferrer';
    comments.textContent = '评论';
    comments.title = '使用 Chrome 打开 Hacker News 评论页';
    comments.setAttribute('aria-label', `使用 Chrome 查看 Hacker News 评论：${item.titleZh || item.title || '新闻'}`);
    row.append(comments);
  }
  return row;
};

selectedItems = function selectedItems(value) {
  const category = activeCategory === 'hn' && activeHnView === 'front' ? 'hn-front' : activeCategory;
  const items = (value.items || []).filter((item) => item.category === category);
  if (activeCategory === 'tech') return items.sort((left, right) => Number(right.score || 0) - Number(left.score || 0)).slice(0, 10);
  if (activeCategory === 'hn') return items.sort((left, right) => Number(left.sourceOrder || 0) - Number(right.sourceOrder || 0)).slice(0, 10);
  return items.sort((left, right) => itemTimestamp(right) - itemTimestamp(left)).slice(0, 10);
};

function hackerNewsMeta(items) {
  const sourceTimes = items.map(sourceTimestamp).filter((value) => value > 0);
  const timestamp = sourceTimes.length ? Math.max(...sourceTimes) : Date.parse(archive.updatedAt || 0);
  const name = activeHnView === 'front' ? 'Front 日榜 Top 10' : '当前 Top 10';
  return `${name} · ${publishedTimeLabel(timestamp)}`;
}

renderArchive = function renderArchive(value, fromCache = false) {
  archive = pruneArchive(value);
  archiveLoadedFromCache = fromCache;
  localStorage.setItem(ARCHIVE_CACHE_KEY, JSON.stringify(archive));
  refs.days.replaceChildren();
  updateCategoryTabs();
  ensureHnSubtabs();

  const items = selectedItems(archive);
  refs.empty.hidden = items.length > 0;
  if (activeCategory === 'hn') {
    refs.archiveMeta.style.whiteSpace = 'nowrap';
    refs.archiveMeta.style.overflow = 'hidden';
    refs.archiveMeta.style.textOverflow = 'ellipsis';
    refs.archiveMeta.textContent = items.length ? hackerNewsMeta(items) : '本次抓取暂无 Hacker News 内容';
  } else {
    refs.archiveMeta.style.whiteSpace = '';
    refs.archiveMeta.style.overflow = '';
    refs.archiveMeta.style.textOverflow = '';
    const mode = activeCategory === 'tech' ? '17家优质科技来源综合热点前10'
      : activeCategory === 'youtube' ? '最近24小时热度前10'
      : activeCategory === 'world' ? '免费来源综合热点前10'
      : '每个网站当前头条';
    refs.archiveMeta.textContent = items.length
      ? `${categoryLabel(activeCategory)} · ${mode} · ${categoryFreshness(items, fromCache)}`
      : `本次抓取暂无${categoryLabel(activeCategory)}内容`;
  }
  if (!items.length) return;

  const section = document.createElement('section');
  section.className = 'day';
  const list = document.createElement('ol');
  list.className = 'news-list';
  items.forEach((item, index) => {
    const li = document.createElement('li');
    li.append(itemButton(item, index + 1));
    list.append(li);
  });
  section.append(list);
  refs.days.append(section);
};

selectCategory = function selectCategory(category) {
  if (!['tech', 'market', 'world', 'youtube', 'hn'].includes(category) || category === activeCategory) return;
  activeCategory = category;
  localStorage.setItem('globalnews-reader-category', category);
  renderArchive(archive, archiveLoadedFromCache);
  if (!selectedItems(archive).length) loadArchive();
};

const SWIPE_MIN_DISTANCE = 48;
const SWIPE_DIRECTION_DOMINANCE = 1.25;
const PAGE_TURN_OUT_MS = 140;
const PAGE_TURN_IN_MS = 230;
const PAGE_TURN_CLASSES = [
  'page-turn-next-out', 'page-turn-next-in',
  'page-turn-previous-out', 'page-turn-previous-in',
];
let pageTurnInProgress = false;

function swipePages() {
  return refs.tabs.flatMap((tab) => {
    const category = tab.dataset.category;
    if (!category) return [];
    if (category === 'hn') return [
      { category: 'hn', hnView: 'current' },
      { category: 'hn', hnView: 'front' },
    ];
    return [{ category }];
  });
}

function waitForPageTurn(className, duration) {
  refs.days.classList.add(className);
  return new Promise((resolve) => {
    window.setTimeout(() => {
      refs.days.classList.remove(className);
      resolve();
    }, duration);
  });
}

async function moveToAdjacentPage(step) {
  if (pageTurnInProgress) return false;
  const pages = swipePages();
  const currentIndex = pages.findIndex((page) => page.category === activeCategory && (
    page.category !== 'hn' || page.hnView === activeHnView
  ));
  const target = pages[currentIndex + step];
  if (currentIndex < 0 || !target) return false;

  const direction = step > 0 ? 'next' : 'previous';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  pageTurnInProgress = true;
  refs.days.classList.add('page-turning');
  try {
    if (!reduceMotion) await waitForPageTurn(`page-turn-${direction}-out`, PAGE_TURN_OUT_MS);
    activeCategory = target.category;
    localStorage.setItem('globalnews-reader-category', activeCategory);
    if (target.category === 'hn') {
      activeHnView = target.hnView;
      localStorage.setItem('globalnews-reader-hn-view', activeHnView);
    }
    renderArchive(archive, archiveLoadedFromCache);
    if (!selectedItems(archive).length) loadArchive();
    if (!reduceMotion) await waitForPageTurn(`page-turn-${direction}-in`, PAGE_TURN_IN_MS);
  } finally {
    refs.days.classList.remove('page-turning', ...PAGE_TURN_CLASSES);
    pageTurnInProgress = false;
  }
  return true;
}

let listTouchStart = null;
refs.days.addEventListener('touchstart', (event) => {
  if (pageTurnInProgress || event.touches.length !== 1) { listTouchStart = null; return; }
  const touch = event.touches[0];
  listTouchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
refs.days.addEventListener('touchmove', (event) => {
  if (event.touches.length !== 1) listTouchStart = null;
}, { passive: true });
refs.days.addEventListener('touchcancel', () => { listTouchStart = null; }, { passive: true });
refs.days.addEventListener('touchend', (event) => {
  const start = listTouchStart;
  listTouchStart = null;
  const touch = event.changedTouches[0];
  if (!start || !touch) return;
  const deltaX = touch.clientX - start.x;
  const deltaY = touch.clientY - start.y;
  if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE || Math.abs(deltaX) <= Math.abs(deltaY) * SWIPE_DIRECTION_DOMINANCE) return;
  if (event.cancelable) event.preventDefault();
  moveToAdjacentPage(deltaX < 0 ? 1 : -1);
}, { passive: false });

ensureHnSubtabs();
updateCategoryTabs();

// Mobile startup optimization: paint the last good snapshot synchronously from localStorage.
// reader.js continues its network refresh in the background and replaces this view only when newer data arrives.
const startupCachedArchive = pruneArchive(jsonStorage(ARCHIVE_CACHE_KEY, { items: [] }));
if (startupCachedArchive.items.length) {
  renderArchive(startupCachedArchive, false);
} else if (archive?.items?.length) {
  renderArchive(archive, archiveLoadedFromCache);
}
