# GlobalNews

全球科技、美股、国际、YouTube 与 Hacker News 中文热点阅读器。

- 前端是纯静态 GitHub Pages，不使用 Electron。
- 新闻由 GitHub Actions 定时抓取、排序并翻译标题。
- 文章正文由 Cloudflare Worker 提取，并通过 Workers AI 翻译。
- 构建时把 CSS、JavaScript、图标、PWA 清单和新闻快照改名为 `文件名-内容哈希.后缀`，不使用查询参数规避缓存。

## 本地验证

```bash
npm ci
npm test
npm run build
```

构建产物位于 `dist/`。

## 自动刷新与阅读器 Worker

迁移验证期间，网页继续使用已经在线的 `dailyreview-reader` Worker，并把 DailyReview 的实时新闻快照作为临时回退；`DailyReview` 仓库不会被修改或删除。把以下原仓库密钥配置到 GlobalNews 后，可手动运行对应工作流完成独立切换：

- `YOUTUBE_API_KEY`：刷新 YouTube Top 10。
- `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`：部署 `globalnews-reader` Worker。

独立 Worker 验证通过后，把 `site/reader.js` 的 `API_ROOT` 改为 `https://globalnews-reader.xf5464.workers.dev`，并恢复 `refresh-news.yml` 的半小时定时触发。
