const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED_CATEGORIES, verifyReaderRefresh } = require('../scripts/verify-reader-refresh');

const now = Date.parse('2026-09-08T03:00:00Z');

function archive(overrides = {}) {
  return {
    items: REQUIRED_CATEGORIES.flatMap((category) => Array.from({ length: 10 }, (_, sourceOrder) => ({
      category,
      sourceOrder,
      title: `Current ${category} headline ${sourceOrder}`,
      titleZh: `当前${category}标题${sourceOrder}`,
      url: `https://example.com/${category}/${sourceOrder}`,
      fetchedAt: new Date(now - 60_000).toISOString(),
      sourceUpdatedAt: new Date(now - 60_000).toISOString(),
      isCached: false,
    }))),
    ...overrides,
  };
}

test('accepts a complete current translated reader snapshot', () => {
  assert.equal(verifyReaderRefresh(archive(), now), true);
});

test('accepts a complete cached category so other categories can still publish', () => {
  const value = archive();
  value.items.filter((item) => item.category === 'market').forEach((item) => { item.isCached = true; });
  assert.equal(verifyReaderRefresh(value, now), true);
});

test('accepts an older category but still rejects untranslated titles', () => {
  const value = archive();
  const item = value.items.find((entry) => entry.category === 'youtube');
  item.fetchedAt = '2026-09-08T02:00:00Z';
  item.sourceUpdatedAt = item.fetchedAt;
  item.titleZh = '';
  assert.throws(() => verifyReaderRefresh(value, now), /youtube: 1\/10 untranslated titles/);
});

test('rejects a category without a complete Top 10 fallback', () => {
  const value = archive();
  value.items = value.items.filter((item) => !(item.category === 'world' && item.sourceOrder === 9));
  assert.throws(() => verifyReaderRefresh(value, now), /world: 9\/10 items/);
});
