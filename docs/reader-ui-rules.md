# GlobalNews 阅读器 UI 规则

## Hacker News 二级页签

Hacker News 分类包含两个二级页签：

- `当前 Top 10`：读取当前 Hacker News Top Stories。
- `Front 日榜 Top 10`：读取 `news.ycombinator.com/front` 的日榜前 10。

## 顶部状态行稳定性

切换 Hacker News 的两个二级页签时，热点标题下方的状态行必须保持固定为一行，不能因为文案长度不同在一行和两行之间切换，避免页面内容整体上下跳动。

状态行只显示“页签名称 + 抓取时间”：

- `当前 Top 10 · 今天 17:03`
- `Front 日榜 Top 10 · 今天 17:03`

实现要求：

1. 不再显示 `Hacker News ·`、`news.ycombinator.com/front` 等冗长来源说明。
2. Hacker News 状态行使用 `white-space: nowrap` 语义，并在极窄屏幕下以省略号处理，不允许换成两行。
3. 切换二级页签时，状态行高度保持不变。
4. 时间使用当前列表数据的最近抓取时间；无可用抓取时间时回退到归档更新时间。
5. 其他主分类继续使用各自原有状态说明，不受本规则影响。
