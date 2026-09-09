'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REFRESH_INTERVAL_MS,
  latestYoutubeTimestamp,
  shouldRefreshYouTube,
} = require('../scripts/refresh-youtube-top10-best-effort');

const lastAttempt = Date.parse('2026-09-09T00:00:00Z');

test('runs YouTube at most once every four hours', () => {
  const archive = { categoryAttemptedAt: { youtube: new Date(lastAttempt).toISOString() }, items: [] };
  assert.equal(shouldRefreshYouTube(archive, lastAttempt + REFRESH_INTERVAL_MS - 1), false);
  assert.equal(shouldRefreshYouTube(archive, lastAttempt + REFRESH_INTERVAL_MS), true);
});

test('uses the last YouTube item time when schedule metadata is absent', () => {
  const archive = { items: [{ category: 'youtube', sourceUpdatedAt: new Date(lastAttempt).toISOString() }] };
  assert.equal(latestYoutubeTimestamp(archive), lastAttempt);
  assert.equal(shouldRefreshYouTube(archive, lastAttempt + 60 * 60 * 1000), false);
});

test('allows the first YouTube refresh when no prior attempt or data exists', () => {
  assert.equal(shouldRefreshYouTube({ items: [] }, lastAttempt), true);
});
