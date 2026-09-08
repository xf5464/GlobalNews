'use strict';

const source = process.env.GOOGLE_NEWS_SOURCE;
if (!source) throw new Error('GOOGLE_NEWS_SOURCE is required.');

async function main() {
  const target = new URL(source);
  const articleId = target.pathname.split('/').filter(Boolean).at(-1);
  const pageResponse = await fetch('https://news.google.com/articles/' + encodeURIComponent(articleId), {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      accept: 'text/html',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  const pageHtml = await pageResponse.text();
  const signature = pageHtml.match(/data-n-a-sg=["']([^"']+)["']/)?.[1] || '';
  const timestamp = pageHtml.match(/data-n-a-ts=["']([^"']+)["']/)?.[1] || '';
  const externalUrls = [];
  console.log(JSON.stringify({
    pageStatus: pageResponse.status,
    pageUrl: pageResponse.url,
    pageLength: pageHtml.length,
    signature,
    timestamp,
    externalUrls,
  }, null, 2));

  const requestValue = JSON.stringify([
    'garturlreq',
    [['en-US', 'US', ['FINANCE_TOP_INDICES', 'WEB_TEST_1_0_0'], null, null, 1, 1, 'US:en',
      null, 180, null, null, null, null, null, 0, null, null, [1608992183, 723341000]],
      'en-US', 'US', 1, [2, 3, 4, 8], 1, 0, '655000234', 0, 0, null, 0],
    articleId,
  ]);
  const envelope = ['Fbv4je', requestValue, null, '1'];
  const response = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      referer: 'https://news.google.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
    },
    body: 'f.req=' + encodeURIComponent(JSON.stringify([[envelope]])),
  });
  const text = await response.text();
  if (signature && timestamp) {
    const signedRequestValue = JSON.stringify([
      'garturlreq',
      [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
        'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
      articleId, Number(timestamp), signature,
    ]);
    const signedResponse = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        referer: 'https://news.google.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      },
      body: 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', signedRequestValue]]])),
    });
    const signedText = await signedResponse.text();
    console.log(JSON.stringify({
      signedStatus: signedResponse.status,
      signedLength: signedText.length,
      signedPrefix: signedText.slice(0, 1800),
    }, null, 2));
  }

  console.log(JSON.stringify({
    status: response.status,
    contentType: response.headers.get('content-type'),
    length: text.length,
    hasResultMarker: text.includes('[\\\"garturlres\\\",\\\"'),
    prefix: text.slice(0, 1800),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
