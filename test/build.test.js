'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('published assets use filename-contenthash.ext instead of query strings', () => {
  const dist = path.resolve('dist');
  assert.equal(fs.existsSync(dist), true, 'run npm run build before the test');
  const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'asset-manifest.json'), 'utf8'));

  assert.doesNotMatch(index, /\?v=/);
  for (const [source, output] of Object.entries(manifest.assets)) {
    assert.match(output, /-[0-9a-f]{12}\.[a-z0-9]+$/);
    assert.equal(fs.existsSync(path.join(dist, output)), true, `${output} should exist`);
    assert.equal(fs.existsSync(path.join(dist, source)), false, `${source} should have been renamed`);
  }
  assert.match(index, /reader-[0-9a-f]{12}\.css/);
  assert.match(index, /reader-[0-9a-f]{12}\.js/);
  assert.match(index, /reader-hn-[0-9a-f]{12}\.js/);
  assert.match(index, /manifest-[0-9a-f]{12}\.webmanifest/);
});
