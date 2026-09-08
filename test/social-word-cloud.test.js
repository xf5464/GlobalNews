const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWordCloud, stripHtml, termsFromText } = require('../scripts/social-word-cloud');

test('removes Mastodon HTML before keyword extraction', () => {
  assert.equal(stripHtml('<p>OpenAI &amp; robots<br>are trending https://example.com/post</p>'), 'OpenAI & robots are trending');
});

test('prefers specific entities/products and removes generic filler topics', () => {
  const terms = termsFromText('Please ask for help reading the latest artificial intelligence programming agents news about OpenAI, Nvidia Rubin, Claude and GPT-5.6');
  assert.ok(terms.includes('OpenAI'));
  assert.ok(terms.includes('英伟达'));
  assert.ok(terms.includes('Rubin'));
  assert.ok(terms.includes('Claude'));
  assert.ok(terms.includes('GPT-5.6'));
  assert.ok(!terms.includes('AI'));
  assert.ok(!terms.includes('编程'));
  assert.ok(!terms.includes('AI智能体'));
  assert.ok(!terms.includes('the'));
  assert.ok(!terms.includes('https'));
  assert.ok(!terms.includes('please'));
  assert.ok(!terms.includes('reading'));
  assert.ok(!terms.includes('ask'));
  assert.ok(!terms.includes('help'));
  assert.ok(!termsFromText('nothing actually').length);
});

test('boosts specific topics confirmed across free sources and excludes YouTube', () => {
  const now = Date.parse('2026-09-06T08:00:00Z');
  const trends = buildWordCloud([
    { text: 'OpenAI releases GPT-5.6', platform: 'Reuters', engagement: 100, publishedAt: '2026-09-06T07:00:00Z', url: 'a', rank: 0 },
    { text: 'OpenAI GPT-5.6 discussion', platform: 'Hacker News', engagement: 200, publishedAt: '2026-09-06T07:30:00Z', url: 'b', rank: 1 },
    { text: 'AI agents improve coding', platform: 'DEV Community', engagement: 400, publishedAt: '2026-09-06T07:45:00Z', url: 'c', rank: 0 },
    { text: 'Nvidia Rubin GPUs', platform: 'TechCrunch', engagement: 40, publishedAt: '2026-09-06T07:45:00Z', url: 'd', rank: 0 },
    { text: 'OpenAI GPT-5.6 video', platform: 'YouTube', engagement: 999999, publishedAt: '2026-09-06T07:55:00Z', url: 'e', rank: 0 },
  ], now, 10);
  assert.ok(['OpenAI', 'GPT-5.6'].includes(trends[0].term));
  assert.equal(trends.find((trend) => trend.term === 'GPT-5.6').platformCount, 2);
  assert.equal(trends.find((trend) => trend.term === 'OpenAI').platformCount, 2);
  assert.ok(trends.some((trend) => trend.term === '英伟达'));
  assert.ok(!trends.some((trend) => ['AI', '编程', 'AI智能体'].includes(trend.term)));
  assert.ok(trends.every((trend) => !trend.platforms.includes('YouTube')));
});
