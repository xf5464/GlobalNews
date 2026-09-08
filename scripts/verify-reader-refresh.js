'use strict';

const fs = require('node:fs');
const { isLanguageNeutralTitle } = require('./send-hot-news-email');

const REQUIRED_CATEGORIES = ['tech', 'market', 'world', 'youtube', 'hn', 'hn-front'];
const EXPECTED_ITEMS = 10;
const DEFAULT_MAX_FETCH_AGE_MINUTES = 10;

function containsChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value || ''));
}

function verifyReaderRefresh(archive, now = Date.now(), maxFetchAgeMinutes = DEFAULT_MAX_FETCH_AGE_MINUTES) {
  const failures = [];
  for (const category of REQUIRED_CATEGORIES) {
    const items = (archive.items || []).filter((item) => item.category === category);
    if (items.length !== EXPECTED_ITEMS) {
      failures.push(`${category}: ${items.length}/${EXPECTED_ITEMS} items`);
      continue;
    }
    const cached = items.filter((item) => item.isCached);
    if (cached.length) failures.push(`${category}: ${cached.length}/${EXPECTED_ITEMS} cached items`);
    const stale = items.filter((item) => {
      const fetchedAt = Date.parse(item.fetchedAt || item.sourceUpdatedAt || '');
      return !Number.isFinite(fetchedAt) || now - fetchedAt > maxFetchAgeMinutes * 60_000;
    });
    if (stale.length) failures.push(`${category}: ${stale.length}/${EXPECTED_ITEMS} stale fetch timestamps`);
    const untranslated = items.filter((item) =>
      !containsChinese(item.title) &&
      !containsChinese(item.titleZh) &&
      !isLanguageNeutralTitle(item.title));
    if (untranslated.length) failures.push(`${category}: ${untranslated.length}/${EXPECTED_ITEMS} untranslated titles`);
  }
  if (failures.length) throw new Error(`Reader refresh is incomplete; refusing to publish: ${failures.join('; ')}`);
  return true;
}

function main() {
  const archivePath = String(process.env.HOT_NEWS_ARCHIVE_PATH || 'site/data/recent.json').trim();
  const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
  verifyReaderRefresh(archive);
  console.log(`Verified fresh reader snapshot: ${REQUIRED_CATEGORIES.length} categories x ${EXPECTED_ITEMS} current Chinese items.`);
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

module.exports = { REQUIRED_CATEGORIES, verifyReaderRefresh };
