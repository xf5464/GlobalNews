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

网页使用独立的 `globalnews-reader` Worker，并只从 GlobalNews 加载新闻快照。`refresh-news.yml` 每 30 分钟刷新一次，也可手动运行：

- `YOUTUBE_API_KEY`：刷新 YouTube Top 10。
- `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`：部署 `globalnews-reader` Worker。

`DailyReview` 中的旧新闻模块暂时保留，待单独确认后再移除。
