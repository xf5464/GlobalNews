const ALLOWED_ORIGIN = "https://xf5464.github.io";
const MAX_HTML_BYTES = 2_500_000;
const MAX_ARTICLE_CHARS = 32_000;
const TRANSLATION_CHUNK_CHARS = 2_400;
const REFRESH_CRON = "*/30 * * * *";
const REFRESH_WORKFLOW_URL = "https://api.github.com/repos/xf5464/GlobalNews/actions/workflows/refresh-news.yml/dispatches";
const PAYWALL_HOSTS = [
  "wsj.com", "bloomberg.com", "ft.com", "barrons.com", "nytimes.com",
  "economist.com", "theinformation.com", "businessinsider.com",
  "fortune.com", "seekingalpha.com", "investors.com",
];
const PAYWALL_PATTERNS = [
  /subscribe to (?:continue|keep) reading/i,
  /sign in to (?:continue|keep) reading/i,
  /already (?:a )?subscriber/i,
  /this article is for subscribers/i,
  /unlock (?:this|the) article/i,
  /subscription required/i,
  /register or sign in to continue/i,
  /become a (?:member|subscriber) to continue/i,
];

const CORS_HEADERS = {
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "accept, content-type",
  "access-control-max-age": "86400",
  vary: "Origin",
};

function json(value, status = 200, cacheControl = "no-store") {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": cacheControl },
  });
}

function assertPublicHttpUrl(rawUrl) {
  let target;
  try { target = new URL(rawUrl); } catch { throw new Error("文章地址格式不正确。"); }
  if (!/^https?:$/.test(target.protocol)) throw new Error("只支持 HTTP 或 HTTPS 文章地址。");
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const blocked = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  if (blocked) throw new Error("不支持本地或内网地址。");
  if (PAYWALL_HOSTS.some((blockedHost) => host === blockedHost || host.endsWith("." + blockedHost))) {
    throw new Error("该来源需要付费订阅，已停止读取。");
  }
  target.hash = "";
  return target;
}

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1].toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    }
    return named[entity.toLowerCase()] || " ";
  });
}

function cleanText(value) {
  return decodeEntities(String(value).replace(/<[^>]+>/g, " "))
    .replace(/[\t\r ]+/g, " ").replace(/\n\s+/g, "\n").trim();
}

function cleanMarkdown(value) {
  return String(value)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\t\r ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_ARTICLE_CHARS);
}

function metaContent(html, names) {
  for (const name of names) {
    const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const first = html.match(new RegExp("<meta[^>]+(?:property|name)=[\"']" + escaped + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"));
    const reversed = html.match(new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:property|name)=[\"']" + escaped + "[\"'][^>]*>", "i"));
    if (first || reversed) return cleanText((first || reversed)[1]);
  }
  return "";
}

function extractArticle(html, finalUrl) {
  const withoutNoise = html
    .replace(/<(script|style|svg|noscript|template|form|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");
  const article = withoutNoise.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  const main = withoutNoise.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const scope = article || main || withoutNoise;
  const blocks = [];
  const blockPattern = /<(p|h2|h3|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = blockPattern.exec(scope)) && blocks.length < 180) {
    const text = cleanText(match[2]);
    if (text.length >= 45 && !blocks.includes(text)) blocks.push(text);
  }
  const titleTag = cleanText(withoutNoise.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  return {
    title: metaContent(html, ["og:title", "twitter:title"]) || titleTag,
    siteName: metaContent(html, ["og:site_name", "application-name"]) || new URL(finalUrl).hostname.replace(/^www\./, ""),
    body: blocks.join("\n\n").slice(0, MAX_ARTICLE_CHARS),
    url: finalUrl,
    extractionSource: "direct",
  };
}

async function extractDirect(target) {
  const response = await fetch(target, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("原网站返回 HTTP " + response.status);
  if (!(response.headers.get("content-type") || "").includes("text/html")) throw new Error("链接不是普通网页");
  if (Number(response.headers.get("content-length") || 0) > MAX_HTML_BYTES) throw new Error("页面过大");
  const article = extractArticle((await response.text()).slice(0, MAX_HTML_BYTES), response.url || target.toString());
  if (article.body.length < 180) throw new Error("正文过短");
  return article;
}

async function extractWithBrowser(env, target) {
  if (!env.BROWSER) throw new Error("未绑定 Browser Run");
  const response = await env.BROWSER.quickAction("markdown", {
    url: target.toString(),
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 20_000 },
  });
  if (!response.ok) throw new Error("Browser Run 返回 HTTP " + response.status);
  const result = await response.json();
  const body = cleanMarkdown(result.result || result.markdown || "");
  if (body.length < 180) throw new Error("Browser Run 未提取到正文");
  return {
    title: String(result.title || body.split("\n")[0] || "").slice(0, 500),
    siteName: target.hostname.replace(/^www\./, ""),
    body,
    url: String(result.url || target),
    extractionSource: "browser-run",
  };
}

async function extractWithJina(target) {
  const response = await fetch("https://r.jina.ai/" + target.toString(), {
    headers: { accept: "text/plain", "x-return-format": "markdown" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("阅读服务返回 HTTP " + response.status);
  const raw = await response.text();
  const title = raw.match(/^Title:\s*(.+)$/mi)?.[1]?.trim() || "";
  const sourceUrl = raw.match(/^URL Source:\s*(.+)$/mi)?.[1]?.trim() || target.toString();
  const markdown = raw.split(/^Markdown Content:\s*$/mi)[1] || raw;
  const body = cleanMarkdown(markdown);
  if (body.length < 180) throw new Error("阅读服务未提取到正文");
  return {
    title,
    siteName: target.hostname.replace(/^www\./, ""),
    body,
    url: sourceUrl,
    extractionSource: "jina-reader",
  };
}

function isLikelyPaywall(text) {
  const content = String(text || "").replace(/\s+/g, " ").trim();
  const matches = PAYWALL_PATTERNS.filter((pattern) => pattern.test(content)).length;
  return matches >= 2 || (matches >= 1 && content.length < 4_000);
}

async function extractReadableArticle(env, target) {
  const failures = [];
  for (const attempt of [
    () => extractDirect(target),
    () => extractWithBrowser(env, target),
    () => extractWithJina(target),
  ]) {
    try {
      const article = await attempt();
      if (isLikelyPaywall(article.body)) {
        const error = new Error("检测到付费订阅墙，已停止读取。");
        error.paywall = true;
        throw error;
      }
      return article;
    } catch (error) {
      if (error.paywall) throw error;
      failures.push(error.message);
    }
  }
  throw new Error("三种读取方式均失败：" + failures.join("；") + "。");
}

function chunksForTranslation(text) {
  const paragraphs = String(text).split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const parts = paragraph.match(new RegExp("[\\s\\S]{1," + TRANSLATION_CHUNK_CHARS + "}", "g")) || [];
    for (const part of parts) {
      const candidate = current ? current + "\n\n" + part : part;
      if (candidate.length > TRANSLATION_CHUNK_CHARS && current) {
        chunks.push(current);
        current = part;
      } else {
        current = candidate;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 16);
}

function translationValue(result) {
  return String(result?.translated_text || result?.translation || result?.result?.translated_text || "").trim();
}

async function translateArticle(env, text) {
  if (!env.AI) throw new Error("Cloudflare Workers AI 尚未绑定。");
  const chunks = chunksForTranslation(text);
  const translated = [];
  for (let offset = 0; offset < chunks.length; offset += 3) {
    const batch = await Promise.all(chunks.slice(offset, offset + 3).map((chunk) => env.AI.run(
      "@cf/meta/m2m100-1.2b",
      { text: chunk, source_lang: "en", target_lang: "zh" },
    )));
    for (const result of batch) {
      const value = translationValue(result);
      if (!value) throw new Error("翻译模型没有返回译文。");
      translated.push(value);
    }
  }
  return translated.join("\n\n");
}

function isGoogleNewsUrl(target) {
  const host = target.hostname.toLowerCase();
  return host === "news.google.com" || host.endsWith(".news.google.com");
}

async function decodeGoogleNewsUrl(target) {
  const articleId = target.pathname.split("/").filter(Boolean).at(-1);
  if (!articleId) throw new Error("Google News 文章编号缺失");

  const pageResponse = await fetch("https://news.google.com/articles/" + encodeURIComponent(articleId), {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
      accept: "text/html",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!pageResponse.ok) throw new Error("Google News 解码页返回 HTTP " + pageResponse.status);
  const html = await pageResponse.text();
  const signature = html.match(/data-n-a-sg=["']([^"']+)["']/)?.[1];
  const timestamp = html.match(/data-n-a-ts=["']([^"']+)["']/)?.[1];
  if (!signature || !timestamp) throw new Error("Google News 解码参数缺失");

  const requestValue = JSON.stringify([
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    articleId,
    Number(timestamp),
    signature,
  ]);
  const response = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      referer: "https://news.google.com/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    },
    body: "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", requestValue]]])),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Google News 解码接口返回 HTTP " + response.status);
  const text = await response.text();
  const marker = '[\\\"garturlres\\\",\\\"';
  const offset = text.indexOf(marker);
  if (offset < 0) throw new Error("Google News 没有返回原媒体地址");
  const escaped = text.slice(offset + marker.length).split('\\\",', 1)[0];
  let resolved;
  try { resolved = JSON.parse('"' + escaped + '"'); }
  catch { resolved = escaped.replaceAll("\\\\/", "/"); }
  if (!/^https?:\/\//i.test(resolved)) throw new Error("Google News 返回了无效媒体地址");
  return assertPublicHttpUrl(resolved);
}

async function resolveGoogleNewsUrl(env, target) {
  try {
    return await decodeGoogleNewsUrl(target);
  } catch {}

  const direct = await fetch(target, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(12_000),
  });
  const directUrl = new URL(direct.url || target.toString());
  if (!isGoogleNewsUrl(directUrl)) return assertPublicHttpUrl(directUrl.toString());

  if (env.BROWSER) {
    const response = await env.BROWSER.quickAction("markdown", {
      url: target.toString(),
      gotoOptions: { waitUntil: "domcontentloaded", timeout: 20_000 },
    });
    if (response.ok) {
      const result = await response.json();
      const browserUrl = new URL(String(result.url || target));
      if (!isGoogleNewsUrl(browserUrl)) return assertPublicHttpUrl(browserUrl.toString());
    }
  }

  const jina = await fetch("https://r.jina.ai/" + target.toString(), {
    headers: { accept: "text/plain", "x-return-format": "markdown" },
    signal: AbortSignal.timeout(20_000),
  });
  if (jina.ok) {
    const sourceUrl = (await jina.text()).match(/^URL Source:\s*(.+)$/mi)?.[1]?.trim();
    if (sourceUrl) {
      const jinaUrl = new URL(sourceUrl);
      if (!isGoogleNewsUrl(jinaUrl)) return assertPublicHttpUrl(jinaUrl.toString());
    }
  }
  throw new Error("暂时无法解析 Google News 的原媒体地址。");
}

async function openApi(request, env) {
  const requestUrl = new URL(request.url);
  let target;
  try { target = assertPublicHttpUrl(requestUrl.searchParams.get("url") || ""); }
  catch (error) { return json({ error: error.message }, 400); }

  if (!isGoogleNewsUrl(target)) {
    return Response.redirect(target.toString(), 302);
  }

  try {
    const resolved = await resolveGoogleNewsUrl(env, target);
    return new Response(null, {
      status: 302,
      headers: {
        location: resolved.toString(),
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return Response.redirect(target.toString(), 302);
  }
}

async function readerApi(request, env, ctx) {
  const requestUrl = new URL(request.url);
  let target;
  try { target = assertPublicHttpUrl(requestUrl.searchParams.get("url") || ""); }
  catch (error) { return json({ error: error.message }, 400); }

  const cache = caches.default;
  const cacheKey = new Request(requestUrl.origin + requestUrl.pathname + "?url=" + encodeURIComponent(target.toString()));
  const cached = await cache.match(cacheKey);
  if (cached) {
    const payload = await cached.json();
    return json({ ...payload, cached: true }, 200, "public, max-age=3600");
  }

  try {
    const article = await extractReadableArticle(env, target);
    const [titleZh, translatedText] = await Promise.all([
      article.title ? translateArticle(env, article.title) : Promise.resolve(""),
      translateArticle(env, article.body),
    ]);
    const payload = {
      url: article.url,
      title: article.title,
      titleZh,
      siteName: article.siteName,
      translatedText,
      extractionSource: article.extractionSource,
      cached: false,
      translatedAt: new Date().toISOString(),
    };
    ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=604800" },
    })));
    return json(payload, 200, "public, max-age=3600");
  } catch (error) {
    return json({ error: error.message || "文章读取或翻译失败。", originalUrl: target.toString() }, 502);
  }
}

async function dispatchNewsRefresh(env) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not configured");
  const response = await fetch(REFRESH_WORKFLOW_URL, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "globalnews-reader-cron",
      "x-github-api-version": "2026-03-10",
    },
    body: JSON.stringify({ ref: "main", inputs: { window_hours: "30" } }),
  });
  if (!response.ok) {
    throw new Error(`GlobalNews refresh dispatch failed: HTTP ${response.status} ${await response.text()}`);
  }
}

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === REFRESH_CRON) ctx.waitUntil(dispatchNewsRefresh(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method === "GET" && url.pathname === "/reader-api") return readerApi(request, env, ctx);
    if (request.method === "GET" && url.pathname === "/open") return openApi(request, env);
    return json({
      service: "GlobalNews Reader",
      status: "ok",
      browserFallback: Boolean(env.BROWSER),
      googleNewsResolver: true,
      cloudflareCron: REFRESH_CRON,
      workerVersion: "2026.09.08.2",
    });
  },
};
