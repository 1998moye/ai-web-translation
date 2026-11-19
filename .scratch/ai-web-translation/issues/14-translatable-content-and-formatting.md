# 14: 完成可翻译内容识别与格式保护

**What to build:** 完善页面翻译会话的内容筛选，使只有需要翻译的英文内容进入 Translation Engine，同时保护代码内容、用户输入、非英文内容、链接和行内格式，避免翻译破坏页面。

**Blocked by:** 13: 完成界面文本译文优先显示

**Status:** ready-for-human

- [x] 按翻译单元识别英文，中英混排页面只提交英文，已有中文、纯数字和纯符号不产生请求。
- [x] 代码块、命令、参数名和行内代码等代码内容保持英文且不进入翻译请求。
- [x] 脚本、样式、隐藏内容和用户自己填写的输入内容不进入翻译请求。
- [x] 非英文内容不会被误提交，页面是否触发自动翻译所需的英文判断可以复用同一语言识别结果。
- [x] 正文和界面文本中的链接、强调及其他行内格式在翻译后保持语义和交互。
- [x] 模型返回内容经过安全处理，不作为可执行页面 HTML 直接注入，不引入脚本或事件处理器。
- [x] 空白、换行和必要的格式标记得到保留，不因规范化导致原文与译文错位。
- [x] 固定样本覆盖技术文档、代码、混排语言、隐藏元素、表单输入、链接和恶意格式输出。
- [x] 测试通过 Page Translation Session 观察提交内容和最终 DOM，不依赖私有扫描函数。

## Comments

### 2026-11-17 实现完成

- 实现：`src/modules/content-scan/scan-translatable-targets.ts`（正文/界面文本识别、代码与隐藏内容保护、最内层单元去重）、`src/modules/inline-format/inline-format.ts`（行内格式占位标记与安全渲染）、`src/modules/language/language.ts`（英文识别）。
- 只提交英文单元：含中日韩字符、明显非英文虚词（法/德/西等）、纯数字与符号都不产生请求；语言识别结果同时用于按网站自动翻译判断。
- 行内代码以占位标记代替，代码内容不进入请求；翻译后按标记还原为 `code`，链接/强调还原为 `a`/`em`/`strong`；模型输出只走 `textContent` 与白名单元素，`script`/`img` 等不会变成可执行节点。
- 验收：`tests/unit/inline-format.test.ts`（13 用例，含未知/不配对/错序标记回退纯文本、HTML 注入防护）、`tests/unit/content-scan.test.ts`（11 用例）、`tests/unit/language.test.ts`（11 用例）、`tests/e2e/page-translation.spec.ts`（中文/法语段落不翻译、代码保持、表单输入不变）。

### 2026-11-17 复核补丁

- 修复隐藏容器（如 `display:none` 折叠面板）内的英文仍被提交的问题：优先使用 `checkVisibility`，其他环境逐层检查祖先的 display/visibility/hidden。
- 补充会话级测试，确认隐藏内容不进入请求、可见内容照常翻译。

### 2026-11-17 修复仓库元数据行译文错位

- 正文扫描新增“紧凑控制行”判断：`div` 内有链接/按钮等界面控件，且直接文本不足 30 字符时，不再当作正文段落。GitHub Trending 的 `TypeScript · 8,480 · 729 · Built by … · stars this week` 这类元数据行因此不会在下方插入整块译文、挤开下一行。
- 元数据里的链接仍按界面文本原位翻译；普通正文 `div`（直接文本足够长）不受影响。
- 验收：`tests/unit/content-scan.test.ts` 新增“仓库元数据行”与“长多链接 div”用例（15 用例）；真实 GitHub Trending 用 fake Engine 抽查，元数据行不再出现 `body-translation`；单测 311、fake e2e 29 passed / 1 skipped、生产 e2e 27 passed。

### 2026-11-17 修复无原文译文与纯链接标题漏翻

- 修复 `checkVisibility` 提前返回导致视觉隐藏节点仍被当成正文的问题：`checkVisibility({ checkVisibilityCSS: true })` 只看 display/visibility，识别不了 GitHub 的 `.sr-only`（1px 裁剪、`clip-path: inset(...)`、`opacity: 0` 等）。现在只有它明确判定不可见时才跳过，否则继续逐层检查视觉隐藏。GitHub 仓库页侧栏里“参与贡献 / 安全策略 / 星标数”等没有原文的重复译文不再出现。
- `isVisuallyHidden` 补齐 `opacity: 0`、`font-size: 0`、负 `text-indent`、非 `inset(50%)` 的 `clip-path`、1px + `overflow: hidden` 等常见 sr-only 写法；纯数字徽章旁不会再多出译文。
- 修复语言判断未剥离闭合行内标记的问题：`classifyText` 改用 `stripInlineMarkers`，只含一个链接的标题不会因为残留的 `⟦/w1⟧` 被多算一个单词、误判为非英文而不翻译。Stack Overflow 风格的问题标题现在保留英文并在下方显示译文。
- 紧凑控制行阈值从“2 个以上控件”放宽到“1 个以上控件”，只有单个用户链接的仓库元数据行也不会再插入整块译文。
- 验收：新增 `tests/e2e/fixtures/stack.html` 与 `tests/e2e/content-recognition.spec.ts`；单测 315、fake e2e 30 passed / 1 skipped、生产 e2e 27 passed、`npm run compile` 通过。

### 2026-11-19 修复整页翻译卡顿与布局错位

- 扫描性能：新增 `src/modules/dom/style-cache.ts`，单次扫描内按元素缓存 `getComputedStyle` 与隐藏状态；可见性检查改为沿祖先递归缓存，避免对每个后代重复逐层读取样式。正文候选先做结构/布局预判，再构建整段 payload。
- 动态内容：MutationObserver 不再每次整页重扫，只收集新增/变化节点所在的最近翻译单元与子树；重扫放到 `requestIdleCallback`，滚动期间继续推迟；超过 40 个改动子树或整页变动时回退整页扫描。
- 渲染性能：翻译结果先进入待渲染队列，按 `BODY_RENDER_BATCH=8` / `INTERFACE_RENDER_BATCH=32` 分帧写入 DOM，滚动时延迟写入；新增 `unchanged` 记录，原文未变时重渲染不会误插重复译文。
- 布局安全：新增 `src/modules/content-scan/layout-safety.ts`，跳过 recharts/highcharts 等图表、flex/grid 容器与数据行、绝对定位浮层、固定高度且 `overflow:hidden` 的卡片；表格译文只放在单元格内部。
- 数据行：块级 `div` 中数字多、词少且没有句子结尾的内容不再当正文，避免排行榜/价格表整行被拼成一条译文。
- 译文样式：字号改为 `clamp()` 限制，增加 `max-width`、`overflow-wrap:anywhere`、`box-sizing:border-box`，标题或大字号单元格不再撑爆版面。
- 视觉分组：正文译文加细左边线并缩进；根据原文 `margin-bottom` 动态增加译文下方间距，让译文与上方原文成组，避免读者把译文误认成下一条原文的译文。表格单元格里取消左边线，避免与列分隔线混淆。
- 验收：新增 `tests/unit/style-cache.test.ts`、`tests/e2e/fixtures/layout.html`、`tests/e2e/layout.spec.ts`；单测 323 passed、fake e2e 31 passed / 1 skipped、生产 e2e 28 passed。3000 段压力页面实测 3081 个译文块约 6.2 秒完成，最长主线程任务 122ms，滚动帧 p95 18ms（本机 Chromium 无头环境，仅作回归参考）。
