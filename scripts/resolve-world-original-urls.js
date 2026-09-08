const fs = require('node:fs');
const {
  archivedGoogleNewsUrls,
  isGoogleNewsUrl,
  resolveGoogleNewsItems,
} = require('./send-hot-news-email');

const ARCHIVE_PATH = String(process.env.HOT_NEWS_ARCHIVE_PATH || 'site/data/recent.json').trim();

async function main() {
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  const items = Array.isArray(archive.items) ? archive.items : [];
  const worldIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item?.category === 'world' && isGoogleNewsUrl(item.url));

  if (!worldIndexes.length) {
    console.log('International URLs already point directly to publisher pages.');
    return;
  }

  const knownUrls = archivedGoogleNewsUrls(ARCHIVE_PATH);
  const resolved = await resolveGoogleNewsItems(worldIndexes.map(({ item }) => item), knownUrls, fetch, 4);
  let replaced = 0;

  resolved.items.forEach((item, offset) => {
    const targetIndex = worldIndexes[offset].index;
    if (!isGoogleNewsUrl(item.url)) {
      items[targetIndex] = {
        ...items[targetIndex],
        ...item,
        googleNewsUrl: item.googleNewsUrl || items[targetIndex].url,
      };
      replaced += 1;
    }
  });

  if (replaced !== worldIndexes.length) {
    const unresolved = worldIndexes.length - replaced;
    throw new Error(`Could not resolve ${unresolved}/${worldIndexes.length} international Google News URL(s) to publisher URLs.`);
  }

  archive.items = items;
  fs.writeFileSync(ARCHIVE_PATH, `${JSON.stringify(archive, null, 2)}\n`, 'utf8');
  console.log(`Saved ${replaced} international publisher URL(s) directly in the reader archive.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
