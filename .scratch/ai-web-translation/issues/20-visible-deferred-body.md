# 20: 扫描时不可见、之后由样式展开的正文

**What to build:** 折叠面板、淡入动画和懒加载容器里的正文在站点只改 CSS 就显示出来之后，也要被翻译；首屏扫描早于站点渲染完成时，文档加载完成后补扫一次，不能把整页正文留在英文状态。

**Blocked by:** 15: 翻译动态新增内容

**Status:** ready-for-human

- [x] 扫描时不可见的正文与界面文本被记为等待可见的候选，而不是永久跳过。
- [x] 淡入动画结束、折叠面板展开、文档加载完成、滚动结束都会重新检查等待中的候选。
- [x] 仍然不可见的候选保持等待，兜底重查有次数上限与元素数量上限，不会无限重查。
- [x] 首屏扫描发生在页面加载完成之前时，`load` 之后补一次整页重扫。
- [x] 站点在自己写 DOM 的同一批次里新增内容不再被整批丢弃。
- [x] 使用「只改样式展开」的样本覆盖动画与折叠面板两种展开方式。

## Comments

### 2026-11-20 修复完成

- 症状：GitHub 等站点上报「已翻译 13 段」但正文仍是英文；本地可用样本稳定复现（隐藏段落永远不翻译）。
- 原因一：`scanTranslatableTargets` 直接把不可见候选丢掉，而站点展开内容只改 CSS，不产生 childList/characterData 变动，MutationObserver 收不到，于是永远不会重扫。
- 原因二：文档加载完成前扫描到的只是首屏快照，加载完成后补扫缺失，站点在加载期间渲染的正文只能靠恰好发生的 DOM 变动救回来。
- 原因三：`onMutations` 在 `mutating > 0` 时整批返回，站点在同一批次里的变动会被一起丢掉。
- 实现：
  - 扫描新增 `onVisibilityDeferred`，不可见候选按元素上报；`classifyEligibility` 区分「不可见」与「不该翻译」。
  - 会话新增等待集合与重查（`revealCandidates`），由 `transitionend` / `animationend` / `scroll` / `load` 触发，兜底定时器 1.2s、最多 6 轮、最多记 400 个元素；高信号事件可以把兜底重查提前。
  - `start()` 记录首屏是否发生在加载完成前，`load` 之后整页重扫一次。
  - `onMutations` 只忽略「命中自己刚改过的元素」的变动，其余照常处理。
- 验收：`tests/unit/content-scan.test.ts`（不可见候选上报、代码与图表不进入等待列表、隐藏的界面文本可见后重建单元）；`tests/unit/page-translation-session.test.ts`（CSS 展开后翻译、动画结束立即重查、加载完成补扫、首屏后才渲染的正文靠补扫接住）；`tests/e2e/page-translation.spec.ts`（`late-reveal.html` 淡入与折叠面板两段在展开后被翻译）。

### 2026-11-20 追加：首屏之后的补扫与扫描异常隔离

- 单页应用常在首屏扫描之后才渲染正文，而且未必伴随可监听的 DOM 变动；`start()` 之后在 1.2s 与 4s 各补一次整页重扫（`SETTLE_RESCAN_DELAYS_MS`）。
- `reconcileScan` 包住扫描调用：站点 DOM 引起的单次扫描异常不再让会话永久停在旧状态，保留已有译文等下一次触发重试。

### 2026-11-20 追加：裁剪判定不再误杀正常布局

- 症状：GitHub 仓库页的正文（文件列表、侧栏 About / Languages）整块不翻译，无论是否重新翻译。
- 原因：`isTightlyClipped` 用「计算样式 height 不是 auto」判断裁剪，但块级元素的 height 一律是像素值，于是任何 `overflow: hidden` 的容器都被判成裁剪。实测该页有 129 个单元格被 `TABLE.OverviewTable`、22 个被 `sidebarSection` 误判跳过。
- 实现：改为测量真实溢出（`scrollHeight > clientHeight + 1` 或 `scrollWidth > clientWidth + 1`），并跳过 `html` / `body`（页面自身滚动属于正常布局）。
- 验收：`tests/unit/content-scan.test.ts`（真正裁剪的卡片仍跳过、圆角盒子这类未裁剪容器照常翻译）；GitHub 仓库页 215 → 218 段，侧栏 About 出现译文；`tests/e2e/layout.spec.ts` 固定高度卡片仍然不插译文。

### 2026-11-20 追加：构建时间戳

- 悬浮 UI 的宿主节点写入 `data-aiwt-build`（`__AIWT_BUILD__`，wxt 配置里的构建时间戳）。排查「扩展重新加载了没有 / 跑的是哪次构建」时，页面上直接可读，不必再靠猜。

### 2026-11-20 追加：display: contents 外壳不再让整片正文被当成隐藏

- 症状：登录态 GitHub 仓库页「已翻译 13 段」，正文全英文；插件自己的扫描器在该 DOM 上只认出 9 段（0 正文），并把 1123 个元素判成不可见。
- 原因：GitHub 的 ui-service 外壳用 `display: contents` 包住整片正文。没有盒子的元素，浏览器 `checkVisibility()` 一律返回 false，而 `computeHidden` 会沿祖先链逐层调用它，于是外壳以下全部算隐藏，只剩外壳以外的导航链接可翻。
- 实现：`computeHidden` 对 `display: contents` 的元素跳过 `checkVisibility`（其余样式判定照常），并在 `isVisuallyHidden` 里显式识别 `content-visibility: hidden`（折叠 `<details>` 等内容仍按隐藏处理）。
- 验收：`tests/unit/style-cache.test.ts`（`display: contents` 外壳下的后代不算隐藏、`content-visibility: hidden` 仍算隐藏）；`tests/unit/content-scan.test.ts`（contents 外壳里的正文照常建立单元）；本地复现页（contents 外壳包住正文）从「0 个正文译文」变为 6 个正文块、8/8 段。
