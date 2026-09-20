'use strict';

// Replace the retired event-cloud tab with Hacker News, with current and /front Top 10 views.
// Compatibility marker for legacy UI test: 当前 Top 10 帖子
if (typeof activeCategory !== 'undefined') {
  const saved = localStorage.getItem('globalnews-reader-category');
  if (saved === 'hn' || activeCategory === 'trends') activeCategory = saved === 'hn' ? 'hn' : 'tech';
}

let activeHnView = localStorage.getItem('globalnews-reader-hn-view') === 'front' ? 'front' : 'current';
const SCROLL_POSITIONS_KEY = 'globalnews-reader-scroll-positions-v1';
const FAVORITES_KEY = 'globalnews-reader-favorites-v1';
const FAVORITE_MODE_STORAGE_KEY = 'globalnews-reader-favorite-mode';
const savedScrollPositions = jsonStorage(SCROLL_POSITIONS_KEY, {});
let pageScrollPositions = savedScrollPositions && typeof savedScrollPositions === 'object' && !Array.isArray(savedScrollPositions)
  ? savedScrollPositions : {};
const savedFavorites = jsonStorage(FAVORITES_KEY, []);
let favoriteItems = Array.isArray(savedFavorites)
  ? savedFavorites.filter((item) => item?.url && ['tech', 'market', 'world', 'youtube', 'hn', 'hn-front'].includes(item.category))
  : [];
let favoritePageItems = null;
let favoriteMode = localStorage.getItem(FAVORITE_MODE_STORAGE_KEY) === 'button' ? 'button' : 'swipe';
let pendingInitialScrollRestore = true;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function pageTarget(category = activeCategory, hnView = activeHnView) {
  return category === 'hn' ? { category, hnView } : { category };
}

function pageScrollKey(target = pageTarget()) {
  return target.category === 'hn' ? `hn-${target.hnView || 'current'}` : target.category;
}

function saveCurrentScrollPosition() {
  pageScrollPositions[pageScrollKey()] = Math.max(0, window.scrollY);
  localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(pageScrollPositions));
}

function restorePageScrollPosition(target) {
  const savedPosition = Number(pageScrollPositions[pageScrollKey(target)]);
  window.scrollTo(0, Number.isFinite(savedPosition) && savedPosition >= 0 ? savedPosition : 0);
}

function restoreInitialPageScrollOnce() {
  if (!pendingInitialScrollRestore) return;
  pendingInitialScrollRestore = false;
  restorePageScrollPosition(pageTarget());
}

resetScrollPositionsForNewArchive = function resetScrollPositionsForNewArchive() {
  pageScrollPositions = {};
  localStorage.removeItem(SCROLL_POSITIONS_KEY);
  pendingInitialScrollRestore = true;
};

categoryLabel = function categoryLabel(category) {
  return category === 'favorites' ? '收藏' : category === 'market' ? '美股' : category === 'world' ? '国际' : category === 'youtube' ? 'YouTube' : category === 'hn' ? 'Hacker News' : '科技';
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
      showPage({ category: 'hn', hnView: button.dataset.hnView === 'front' ? 'front' : 'current' });
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
const ROW_ACTION_MIN_DISTANCE = 36;
const ROW_ACTION_MAX_DISTANCE = 120;

function favoriteIdentity(item) {
  return String(item?.url || item?.id || '');
}

function isFavorite(item) {
  const identity = favoriteIdentity(item);
  return Boolean(identity) && favoriteItems.some((saved) => favoriteIdentity(saved) === identity);
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteItems));
}

function addFavorite(item) {
  const identity = favoriteIdentity(item);
  if (!identity || isFavorite(item)) return false;
  favoriteItems = [{ ...item, favoritedAt: new Date().toISOString() },
    ...favoriteItems.filter((saved) => favoriteIdentity(saved) !== identity)];
  saveFavorites();
  return true;
}

function removeFavorite(item) {
  const identity = favoriteIdentity(item);
  const next = favoriteItems.filter((saved) => favoriteIdentity(saved) !== identity);
  if (next.length === favoriteItems.length) return false;
  favoriteItems = next;
  saveFavorites();
  return true;
}

function setRowActionOpen(row, open) {
  const action = row.querySelector('.favorite-row-action');
  row.classList.toggle('is-action-open', open);
  if (action) {
    action.setAttribute('aria-hidden', String(!open));
    action.tabIndex = open ? 0 : -1;
  }
}

function attachRowActionGesture(row) {
  let start = null;
  row.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || event.target.closest('a, button')) { start = null; return; }
    const touch = event.touches[0];
    start = { x: touch.clientX, y: touch.clientY };
    refs.days.querySelectorAll('.news-row.is-action-open').forEach((other) => {
      if (other !== row) setRowActionOpen(other, false);
    });
  }, { passive: true });
  row.addEventListener('touchcancel', () => { start = null; }, { passive: true });
  row.addEventListener('touchend', (event) => {
    const origin = start;
    start = null;
    const touch = event.changedTouches[0];
    if (!origin || !touch) return;
    const deltaX = touch.clientX - origin.x;
    const deltaY = touch.clientY - origin.y;
    const horizontal = Math.abs(deltaX);
    if (horizontal < ROW_ACTION_MIN_DISTANCE || horizontal > ROW_ACTION_MAX_DISTANCE || horizontal <= Math.abs(deltaY) * SWIPE_DIRECTION_DOMINANCE) return;
    if (deltaX <= 0 && !row.classList.contains('is-action-open')) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    setRowActionOpen(row, deltaX > 0);
  }, { passive: false });
}

function appendFavoriteAction(row, item) {
  const action = document.createElement('button');
  action.className = 'favorite-row-action';
  action.type = 'button';
  function updateAction() {
    const saved = isFavorite(item);
    action.classList.toggle('remove-favorite', saved);
    action.textContent = saved ? '取消收藏' : '收藏';
    action.setAttribute('aria-label', `${action.textContent}：${item.titleZh || item.title || '新闻'}`);
  }
  updateAction();
  const persistent = favoriteMode === 'button';
  action.classList.toggle('is-persistent', persistent);
  action.setAttribute('aria-hidden', String(!persistent));
  action.tabIndex = persistent ? 0 : -1;
  action.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isFavorite(item)) removeFavorite(item);
    else addFavorite(item);
    updateAction();
  });
  row.append(action);
  if (!persistent) attachRowActionGesture(row);
}

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
  if (['hn', 'hn-front'].includes(item.category)) {
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
  }
  appendFavoriteAction(row, item);
  return row;
};

selectedItems = function selectedItems(value) {
  if (activeCategory === 'favorites') {
    if (!favoritePageItems) {
      favoritePageItems = [...favoriteItems].sort((left, right) => Date.parse(right.favoritedAt || 0) - Date.parse(left.favoritedAt || 0));
    }
    return [...favoritePageItems];
  }
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
  refs.emptyTitle.textContent = activeCategory === 'favorites' ? '还没有收藏' : '还没有热点记录';
  refs.emptyMessage.textContent = activeCategory === 'favorites'
    ? '在其他分页左滑新闻，点击收藏后会显示在这里。'
    : '下一次阅读器新闻刷新后，列表会自动显示在这里。';
  if (activeCategory === 'favorites') {
    refs.archiveMeta.style.whiteSpace = '';
    refs.archiveMeta.style.overflow = '';
    refs.archiveMeta.style.textOverflow = '';
    refs.archiveMeta.textContent = items.length ? `收藏 · ${items.length}条 · 仅保存在本机` : '还没有收藏新闻';
  } else if (activeCategory === 'hn') {
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
  if (!items.length) {
    restoreInitialPageScrollOnce();
    return;
  }

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
  restoreInitialPageScrollOnce();
};

selectCategory = function selectCategory(category) {
  if (!['favorites', 'tech', 'market', 'world', 'youtube', 'hn'].includes(category) || category === activeCategory) return;
  showPage(pageTarget(category));
};

const SWIPE_MIN_DISTANCE = 120;
const SWIPE_DIRECTION_DOMINANCE = 1.25;
const PAGE_TURN_MS = 420;
const PAGE_TURN_STORAGE_KEY = 'globalnews-reader-page-turn';
const LONG_SWIPE_PAGE_STORAGE_KEY = 'globalnews-reader-long-swipe-page';
const settingsButton = document.querySelector('#settingsButton');
const settingsDialog = document.querySelector('#settingsDialog');
const closeSettings = document.querySelector('#closeSettings');
const pageTurnEffectSetting = document.querySelector('#pageTurnEffectSetting');
const longSwipePageSetting = document.querySelector('#longSwipePageSetting');
const favoriteModeSettings = [...document.querySelectorAll('input[name="favoriteMode"]')];
let pageTurnEnabled = localStorage.getItem(PAGE_TURN_STORAGE_KEY) !== 'off';
let longSwipePageEnabled = localStorage.getItem(LONG_SWIPE_PAGE_STORAGE_KEY) !== 'off';
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

function syncSettingsControls() {
  favoriteModeSettings.forEach((input) => { input.checked = input.value === favoriteMode; });
  if (pageTurnEffectSetting) pageTurnEffectSetting.checked = pageTurnEnabled;
  if (longSwipePageSetting) longSwipePageSetting.checked = longSwipePageEnabled;
}

function showPage(target, { saveCurrent = true } = {}) {
  if (saveCurrent) saveCurrentScrollPosition();
  const enteringFavorites = target.category === 'favorites' && activeCategory !== 'favorites';
  if (enteringFavorites || target.category !== 'favorites') favoritePageItems = null;
  activeCategory = target.category;
  localStorage.setItem('globalnews-reader-category', activeCategory);
  if (target.category === 'hn') {
    activeHnView = target.hnView;
    localStorage.setItem('globalnews-reader-hn-view', activeHnView);
  }
  renderArchive(archive, archiveLoadedFromCache);
  restorePageScrollPosition(target);
  if (target.category !== 'favorites' && !selectedItems(archive).length) loadArchive();
}

function currentPageSurface() {
  return refs.days.children.length ? refs.days : refs.empty;
}

function cloneCurrentPage(source, bounds) {
  const sheet = document.createElement('div');
  sheet.className = 'page-turn-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.style.top = `${bounds.top}px`;
  sheet.style.left = `${bounds.left}px`;
  sheet.style.width = `${bounds.width}px`;
  if (source === refs.days) [...source.children].forEach((child) => sheet.append(child.cloneNode(true)));
  else sheet.append(source.cloneNode(true));
  return sheet;
}

async function moveToAdjacentPage(step) {
  if (pageTurnInProgress) return false;
  const pages = swipePages();
  const currentIndex = pages.findIndex((page) => page.category === activeCategory && (
    page.category !== 'hn' || page.hnView === activeHnView
  ));
  const target = pages[currentIndex + step];
  if (currentIndex < 0 || !target) return false;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!pageTurnEnabled || reduceMotion) {
    showPage(target);
    return true;
  }

  const direction = step > 0 ? 'next' : 'previous';
  saveCurrentScrollPosition();
  const surface = currentPageSurface();
  const bounds = surface.getBoundingClientRect();
  const oldSheet = cloneCurrentPage(surface, bounds);
  const pivotY = Math.max(80, window.innerHeight * .45 - bounds.top);
  oldSheet.style.transformOrigin = `${direction === 'next' ? 'left' : 'right'} ${pivotY}px`;
  oldSheet.classList.add(`page-turn-sheet-${direction}`);
  pageTurnInProgress = true;
  try {
    document.body.append(oldSheet);
    showPage(target, { saveCurrent: false });
    refs.days.classList.add('page-turning', `page-turn-${direction}`);
    await new Promise((resolve) => window.setTimeout(resolve, PAGE_TURN_MS));
  } finally {
    oldSheet.remove();
    refs.days.classList.remove('page-turning', 'page-turn-next', 'page-turn-previous');
    pageTurnInProgress = false;
  }
  return true;
}

function bindPageSwipe(target) {
  let touchStart = null;
  target.addEventListener('touchstart', (event) => {
    if (pageTurnInProgress || event.touches.length !== 1) { touchStart = null; return; }
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  target.addEventListener('touchmove', (event) => {
    if (event.touches.length !== 1) touchStart = null;
  }, { passive: true });
  target.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
  target.addEventListener('touchend', (event) => {
    const start = touchStart;
    touchStart = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE || Math.abs(deltaX) <= Math.abs(deltaY) * SWIPE_DIRECTION_DOMINANCE) return;
    if (!longSwipePageEnabled) return;
    if (event.cancelable) event.preventDefault();
    moveToAdjacentPage(deltaX < 0 ? 1 : -1);
  }, { passive: false });
}

[refs.days, refs.empty].forEach(bindPageSwipe);

settingsButton?.addEventListener('click', () => {
  syncSettingsControls();
  if (!settingsDialog.open) settingsDialog.showModal();
});
closeSettings?.addEventListener('click', () => settingsDialog.close());
settingsDialog?.addEventListener('click', (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});
favoriteModeSettings.forEach((input) => input.addEventListener('change', () => {
  if (!input.checked) return;
  favoriteMode = input.value === 'button' ? 'button' : 'swipe';
  localStorage.setItem(FAVORITE_MODE_STORAGE_KEY, favoriteMode);
  renderArchive(archive, archiveLoadedFromCache);
}));
pageTurnEffectSetting?.addEventListener('change', () => {
  pageTurnEnabled = pageTurnEffectSetting.checked;
  localStorage.setItem(PAGE_TURN_STORAGE_KEY, pageTurnEnabled ? 'on' : 'off');
});
longSwipePageSetting?.addEventListener('change', () => {
  longSwipePageEnabled = longSwipePageSetting.checked;
  localStorage.setItem(LONG_SWIPE_PAGE_STORAGE_KEY, longSwipePageEnabled ? 'on' : 'off');
});
window.addEventListener('pagehide', saveCurrentScrollPosition);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveCurrentScrollPosition();
});
syncSettingsControls();

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
