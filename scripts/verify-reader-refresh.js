'use strict';

const fs = require('node:fs');

const REQUIRED_CATEGORIES = ['tech', 'market', 'world', 'youtube', 'hn', 'hn-front'];
const EXPECTED_ITEMS = 10;

function verifyReaderRefresh(archive) {
  const failures = [];
  for (const category of REQUIRED_CATEGORIES) {
    const items = (archive.items || []).filter((item) => item.category === category);
    if (items.length !== EXPECTED_ITEMS) {
      failures.push(`${category}: ${items.length}/${EXPECTED_ITEMS} items`);
      continue;
    }
    const incomplete = items.filter((item) => !item.url || !item.title);
    if (incomplete.length) failures.push(`${category}: ${incomplete.length}/${EXPECTED_ITEMS} incomplete items`);
  }
  if (failures.length) throw new Error(`Reader refresh is incomplete; refusing to publish: ${failures.join('; ')}`);
  return true;
}

function main() {
  const archivePath = String(process.env.HOT_NEWS_ARCHIVE_PATH || 'site/data/recent.json').trim();
  const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
  verifyReaderRefresh(archive);
  const cachedCategories = REQUIRED_CATEGORIES.filter((category) => {
    const items = (archive.items || []).filter((item) => item.category === category);
    return items.length === EXPECTED_ITEMS && items.every((item) => item.isCached);
  });
  console.log(`Verified publishable reader snapshot: ${REQUIRED_CATEGORIES.length} categories x ${EXPECTED_ITEMS} complete items.${cachedCategories.length ? ` Retained previous data for: ${cachedCategories.join(', ')}.` : ''}`);
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

module.exports = { REQUIRED_CATEGORIES, verifyReaderRefresh };
