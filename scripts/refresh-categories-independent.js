'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

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

function main() {
  const failedStages = [];
  for (const stage of STAGES) {
    if (runScript(stage.script, stage.env)) continue;
    failedStages.push(stage.label);
    console.warn(`${stage.label} stage failed; continuing so the other categories can still update.`);
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

module.exports = { STAGES, runScript };
