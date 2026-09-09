'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isUsableCategory,
  refreshCategory,
} = require('../scripts/refresh-reader-aggregated');

function items(category, timestamp = '2026-09-09T01:00:00Z') {
  return Array.from({ length: 10 }, (_, sourceOrder) => ({
    category,
    sourceOrder,
    title: `${category} headline ${sourceOrder}`,
    titleZh: `${category}中文标题${sourceOrder}`,
    url: `https://example.com/${category}/${sourceOrder}`,
    fetchedAt: timestamp,
    sourceUpdatedAt: timestamp,
    isCached: false,
  }));
}

test('keeps only the failed category previous Top 10', async () => {
  const previous = items('world');
  const result = await refreshCategory('world', previous, async () => []);
  assert.equal(result.length, 10);
  assert.equal(result.every((item) => item.isCached), true);
});

test('uses a complete newly refreshed category', async () => {
  const fresh = items('market', '2026-09-09T02:00:00Z');
  const result = await refreshCategory('market', items('market'), async () => fresh);
  assert.equal(isUsableCategory(result), true);
  assert.equal(result.every((item) => !item.isCached), true);
  assert.equal(result[0].sourceUpdatedAt, '2026-09-09T02:00:00Z');
});

test('an untranslated item is still a usable refreshed category item', () => {
  const fresh = items('world');
  fresh[0].titleZh = '';
  assert.equal(isUsableCategory(fresh), true);
});
