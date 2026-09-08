'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pruneArchiveFile } = require('./hot-news-archive');

const projectRoot = path.resolve(__dirname, '..');
const siteRoot = path.join(projectRoot, 'site');
const distRoot = path.join(projectRoot, 'dist');

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 12);
}

function fingerprint(relativePath) {
  const sourcePath = path.join(distRoot, relativePath);
  const extension = path.extname(relativePath);
  const stem = relativePath.slice(0, -extension.length);
  const fingerprintedPath = `${stem}-${hashFile(sourcePath)}${extension}`;
  fs.renameSync(sourcePath, path.join(distRoot, fingerprintedPath));
  return fingerprintedPath;
}

function replaceRequired(source, target, replacement, fileName) {
  if (!source.includes(target)) throw new Error(`Missing ${target} in ${fileName}`);
  return source.replaceAll(target, replacement);
}

function build() {
  pruneArchiveFile(path.join(siteRoot, 'data', 'recent.json'));
  fs.rmSync(distRoot, { recursive: true, force: true });
  fs.cpSync(siteRoot, distRoot, { recursive: true });

  const icon192 = fingerprint('icon-192.png');
  const icon512 = fingerprint('icon-512.png');

  const manifestSourcePath = path.join(distRoot, 'manifest.webmanifest');
  let manifest = fs.readFileSync(manifestSourcePath, 'utf8');
  manifest = replaceRequired(manifest, 'icon-192.png', icon192, 'manifest.webmanifest');
  manifest = replaceRequired(manifest, 'icon-512.png', icon512, 'manifest.webmanifest');
  fs.writeFileSync(manifestSourcePath, manifest, 'utf8');

  const archive = fingerprint('data/recent.json');
  const readerSourcePath = path.join(distRoot, 'reader.js');
  let reader = fs.readFileSync(readerSourcePath, 'utf8');
  reader = replaceRequired(reader, "new URL('data/recent.json'", `new URL('${archive}'`, 'reader.js');
  fs.writeFileSync(readerSourcePath, reader, 'utf8');

  const generated = {
    'icon-192.png': icon192,
    'icon-512.png': icon512,
    'manifest.webmanifest': fingerprint('manifest.webmanifest'),
    'reader.css': fingerprint('reader.css'),
    'reader.js': fingerprint('reader.js'),
    'reader-hn.js': fingerprint('reader-hn.js'),
    'data/recent.json': archive,
  };

  const indexPath = path.join(distRoot, 'index.html');
  let index = fs.readFileSync(indexPath, 'utf8');
  for (const [source, output] of Object.entries(generated)) {
    if (source === 'data/recent.json' || source === 'icon-512.png') continue;
    index = replaceRequired(index, source, output, 'index.html');
  }
  if (/\?v=/.test(index)) throw new Error('Query-string cache busting remains in index.html');
  fs.writeFileSync(indexPath, index, 'utf8');

  const workerPath = path.join(distRoot, 'service-worker.js');
  let worker = fs.readFileSync(workerPath, 'utf8');
  for (const [source, output] of Object.entries(generated)) {
    worker = replaceRequired(worker, `'${source}'`, `'${output}'`, 'service-worker.js');
  }
  const shellVersion = crypto.createHash('sha256')
    .update(JSON.stringify(generated))
    .digest('hex')
    .slice(0, 12);
  worker = replaceRequired(worker, '__APP_VERSION__', shellVersion, 'service-worker.js');
  fs.writeFileSync(workerPath, worker, 'utf8');

  fs.writeFileSync(path.join(distRoot, '.nojekyll'), '', 'utf8');
  fs.writeFileSync(path.join(distRoot, 'asset-manifest.json'), `${JSON.stringify({ version: shellVersion, assets: generated }, null, 2)}\n`, 'utf8');
  process.stdout.write(`Built GlobalNews ${shellVersion}: ${Object.values(generated).join(', ')}\n`);
}

build();
