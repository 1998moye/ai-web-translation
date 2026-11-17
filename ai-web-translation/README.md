# AI 网页翻译（扩展实现）

Manifest V3 浏览器扩展：用你自己配置的 AI 翻译服务做划词翻译与整页双语翻译。

需求基线：[`../.scratch/ai-web-translation/spec.md`](../.scratch/ai-web-translation/spec.md)，
领域术语：[`../GLOSSARY.md`](../GLOSSARY.md)。

## 环境要求

- Node.js 20+（本项目在 Node 24 上验证）
- npm

## 安装与常用命令

```bash
cd ai-web-translation
npm install

npm run dev              # WXT 开发模式（后台真实 Engine，不含 fake）
npm run build            # 生产构建，输出 .output/chrome-mv3
npm run build:dev-fake   # 开发演示构建，输出 .output-fake/chrome-mv3（fake Engine + 模拟译文）
npm run compile          # wxt prepare + tsc --noEmit
npm test                 # Vitest 单元测试
npm run e2e              # 构建 fake 版本并运行界面/交互端到端测试
npm run e2e:prod         # 构建生产版本，用 mock Chat Completions 服务跑完整链路
npm run verify           # compile + 单元测试 + 生产/演示两种构建
```

首次运行 Playwright 前需要安装浏览器：

```bash
npx playwright install chromium
```

## 本地加载扩展

1. 构建要体验的版本：
   - 生产装配：`npm run build`，目录 `.output/chrome-mv3`
   - 开发演示：`npm run build:dev-fake`，目录 `.output-fake/chrome-mv3`（译文带 `【模拟译文】`，按钮显示「开发演示 · 模拟翻译」）
2. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`
3. 打开右上角「开发者模式」
4. 选择「加载已解压的扩展程序 / 加载解压缩的扩展」，指向上面构建出的目录
5. 打开任意 HTTP/HTTPS 网页，右侧中下部会出现悬浮翻译按钮
6. 首次使用生产版本时，先在扩展设置页新建翻译服务配置（完整 Chat Completions 地址、模型名、可选 API Key），第一份配置会成为默认配置

> 系统 Chrome 137+ 不再接受 `--load-extension` 命令行参数，因此自动化测试无法直接加载未打包扩展；
> 这属于浏览器限制，不是扩展问题。自动化验证使用 Chromium（Chrome for Testing）与 Edge，
> 系统 Chrome 按上面的手动步骤验证。

## 已实现的能力

**翻译服务与配置**

- 多份命名配置：完整 URL、API Key、模型名、自定义请求头、额外请求参数、并发/超时/重试
- API Key 脱敏展示，默认选择可切换，配置保存在本机扩展存储
- 可编辑翻译提示词并一键恢复默认；测试连接使用固定短句验证完整请求
- 译文缓存：相同原文、服务、模型、提示词与请求参数复用译文；可清空
- 任务控制：按配置并发、超时中止、网络/429/5xx 有限重试，400/401/403 直接报告
- 划词翻译：选区图标、译文气泡、配置切换、长选区分批、代码内容保护
- 整页翻译与划词共用同一个后台 Translation Engine，不重复实现请求逻辑

- 设置页：左侧竖向导航（翻译服务 / 提示词 / 缓存 / 网站偏好），支持深色模式、键盘焦点与 URL 锚点直达
- 悬浮面板：状态点与进度条、主操作按钮、带开关的自动翻译入口，靠近视口边缘时自动翻转
- 悬浮按钮探头：拖到边缘会歪头藏在屏幕后，只露一只眼睛并偶尔眨眼；悬停/聚焦时完整滑出
- 界面主题：设置页与浮层统一为奶油纸张 + 墨水描边 + 黄油/珊瑚/青绿配色，深色模式同结构

**整页翻译与页面交互**

- 悬浮翻译按钮：全站默认显示、Shadow DOM 隔离、拖动、全局位置记忆、窗口缩放保持可见
- 关闭一次（仅当前页面）与按完整域名永久停用悬浮按钮；设置页查看/移除停用记录
- 正文双语：段落后插入译文，原文与网页事件不受影响；无需刷新恢复原文
- 界面文本译文优先：导航、菜单、按钮、表单标签显示中文，悬停查看英文原文；输入框与图标原位保留
- 内容保护：只提交英文；代码、脚本、样式、隐藏内容、用户输入不进入请求；行内代码不提交但保留
- 安全渲染：模型输出只按白名单还原 `a`/`em`/`strong`/`code`，不会注入 HTML 或脚本
- 动态内容与原文变化：会话期间自动翻译新增内容，原文指纹变化时旧译文失效并重译
- 会话控制：进度、部分失败原因、失败重试、取消、恢复原文、重新翻译（使用最新默认配置）
- 按网站自动翻译：完整域名 + 页面英文判断；与悬浮按钮停用列表分别管理

## 架构与共享契约

- `src/entrypoints/background.ts`：生产 `ChatCompletionsTranslationEngine`、配置仓库、提示词、译文缓存与 HTTP Adapter 都在后台运行。
- `src/modules/messaging/`：内容脚本通过 Port 提交「配置 ID + 翻译单元」并逐条接收事件；配置目录只返回 ID、名称与默认状态。
- `src/modules/translation-contract/`：`TranslationEngine`（开始翻译 + 取消会话）与 `TranslationProfileCatalog`（只读摘要），以及翻译单元、上下文、事件与脱敏错误类型。
- `src/modules/translation-engine/`：分批、并发、超时、重试、取消、配置快照与缓存接入。
- `src/modules/translation-chat-completions/`：请求构造、响应校验、错误分类与测试连接。
- `src/modules/translation-profile/`、`translation-prompt/`、`translation-cache/`：配置、提示词与缓存的存储与校验。
- `src/modules/selection-translation/`：选区读取、图标与气泡，和悬浮按钮共用同一个 Shadow DOM 容器。
- `src/modules/page-translation/`：Page Translation Session，隐藏扫描、语言判断、单元状态、动态监听、渲染、恢复与进度。
- `src/modules/content-scan/`、`inline-format/`、`language/`：正文/界面文本识别、代码与隐藏内容保护、行内格式与安全渲染。
- `src/modules/translation-fake/`：测试与开发演示 Adapter，仅进入 `.output-fake` 构建。

生产构建中 `__AIWT_FAKE_ENGINE__` 为 `false`，fake 分支与相关文案会被摇树移除；
`tests/e2e-production/assembly.spec.ts` 会检查生产产物不包含 fake Engine 或模拟译文。

## 密钥与隐私

- API Key 与自定义认证请求头只保存在本机扩展存储，并在后台使用；内容脚本只收到配置 ID、名称与默认状态。
- 只有用户主动翻译的选区/页面英文内容、以及必要的翻译上下文会发送到用户配置的翻译服务。
- 自动化测试全部使用 fake Engine 或本地 mock Chat Completions，不使用真实密钥。
- 真实服务手动验证时，密钥只从本地环境读取，不写入代码、测试、日志或 ticket；`.env` 已被 git 忽略。

## 测试

- 单元测试：`tests/unit/`，Vitest + jsdom，通过 Module Interface 观察外部行为
- 界面端到端：`tests/e2e/`，加载 fake 构建，覆盖悬浮按钮、网站偏好、整页/界面文本翻译、动态内容、自动翻译和设置页
- 生产端到端：`tests/e2e-production/`，加载 `.output` 生产构建，翻译服务指向 `tests/e2e/fixtures-server.mjs` 提供的 mock Chat Completions，覆盖配置、划词、整页、缓存、取消、失败重试、重新翻译及错误场景
- 真实服务验收：使用用户提供的兼容服务手动跑一次完整流程（整页 + 划词）

## 真实站点抽查（2026-11-17，mock 服务）

| 站点 | 正文译文 | 界面文本 | 恢复原文 | 代码块 |
|---|---|---|---|---|
| MDN | 90 | 26 | 通过 | 页面样本未渲染 `pre` |
| Wikipedia | 273 | 14 | 通过 | — |
| BBC | 84 | 39 | 通过 | — |
| GitHub | 81 | 47 | 通过 | 未变化 |
| Stack Overflow | 2 | 6 | 通过 | 自动化受限 |

## 当前限制

- 正文单元按段落级识别（段落、列表项、标题、表格单元格等），复杂网页持续适配
- 界面文本用译文替换元素文本，并用 `title` 提供英文原文；站点自建 tooltip 会被临时覆盖，恢复时还原
- 自动翻译只按完整域名和页面英文判断，不保证所有复杂站点；SPA 内容在会话开启后通过动态监听处理
- 浏览器内部页、扩展商店等受限页面不注入；本地文件访问不是默认能力
- 系统 Chrome 需按上面的步骤手动加载；Stack Overflow 等站点对无头自动化有限制
