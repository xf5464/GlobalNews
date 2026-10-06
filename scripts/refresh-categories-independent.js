'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARCHIVE_PATH = String(process.env.HOT_NEWS_ARCHIVE_PATH || 'site/data/recent.json').trim();
const REQUIRED_CATEGORIES = ['tech', 'market', 'world', 'youtube', 'hn', 'hn-front'];
const TOP_LIMIT = 10;

const STAGES = [
  {
    label: 'technology, market and international',
    script: 'scripts/refresh-reader-aggregated.js',
    env: { HOT_NEWS_SKIP_YOUTUBE: 'true' },
  },
  {
    label: 'YouTube four-hour refresh',
    script: 'scripts/refresh-youtube-top10-best-effort.js',
  },
  {
    label: 'international publisher URL resolution',
    script: 'scripts/resolve-world-original-urls.js',
  },
  {
    label: 'Hacker News',
    script: 'scripts/add-hacker-news-top10.js',
  },
];

function runScript(script, extraEnv = {}) {
  const result = spawnSync(process.execPath, [path.join(PROJECT_ROOT, script)], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

function completeCategory(items) {
  return items.length === TOP_LIMIT && items.every((item) => item?.url && item?.title);
}

function restoreIncompleteCategories(currentArchive, originalArchive) {
  let items = Array.isArray(currentArchive?.items) ? [...currentArchive.items] : [];
  const restored = [];
  for (const category of REQUIRED_CATEGORIES) {
    const current = items.filter((item) => item.category === category);
    if (completeCategory(current)) continue;
    const previous = (originalArchive?.items || [])
      .filter((item) => item.category === category)
      .sort((left, right) => Number(left.sourceOrder) - Number(right.sourceOrder))
      .slice(0, TOP_LIMIT);
    if (!completeCategory(previous)) continue;
    items = items.filter((item) => item.category !== category)
      .concat(previous.map((item) => ({ ...item, isCached: true })));
    restored.push(category);
  }
  return {
    archive: { ...currentArchive, items, failureCount: items.filter((item) => item.isCached).length },
    restored,
  };
}

function main() {
  const originalArchive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  const failedStages = [];
  for (const stage of STAGES) {
    if (runScript(stage.script, stage.env)) continue;
    failedStages.push(stage.label);
    console.warn(`${stage.label} stage failed; continuing so the other categories can still update.`);
  }

  const currentArchive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  const repaired = restoreIncompleteCategories(currentArchive, originalArchive);
  if (repaired.restored.length) {
    fs.writeFileSync(ARCHIVE_PATH, `${JSON.stringify(repaired.archive, null, 2)}\n`, 'utf8');
    console.warn(`Restored complete previous data for: ${repaired.restored.join(', ')}.`);
  }

  if (!runScript('scripts/verify-reader-refresh.js')) {
    throw new Error('The combined snapshot has no complete fallback for at least one category.');
  }

  if (failedStages.length) {
    console.warn(`Refresh completed with retained category data: ${failedStages.join(', ')}.`);
  } else {
    console.log('All independent category refresh stages completed.');
  }
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

module.exports = { STAGES, restoreIncompleteCategories, runScript };
