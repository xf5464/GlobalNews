// Standalone GlobalNews refresh scheduler.
// Cloudflare Cron uses UTC:
// - `*/30 * * * *` refreshes the reader every 30 minutes without sending email.

const GITHUB_API = "https://api.github.com/repos/xf5464/GlobalNews/actions/workflows";
const READER_REFRESH_CRON = "*/30 * * * *";

async function dispatchWorkflow(env, workflow, inputs) {
  const response = await fetch(`${GITHUB_API}/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "globalnews-cron",
      "x-github-api-version": "2026-03-10",
    },
    body: JSON.stringify({ ref: "main", inputs }),
  });
  if (!response.ok) throw new Error(`${workflow} dispatch failed: HTTP ${response.status} ${await response.text()}`);
}

export async function sendDailyHotNews(event, env) {
  if (event.cron !== READER_REFRESH_CRON) return false;
  await dispatchWorkflow(env, "refresh-reader.yml", {
    window_hours: "30",
  });
  return true;
}

export async function refreshReaderNow(env) {
  await dispatchWorkflow(env, "refresh-reader.yml", {
    window_hours: "30",
  });
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailyHotNews(event, env));
  },

  async fetch() {
    return Response.json({
      service: "GlobalNews Cron Hot News",
      status: "ok",
      readerRefreshCron: "*/30 * * * *",
      cronVersion: "2026.09.08.1",
    });
  },
};
