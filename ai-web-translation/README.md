# AI 网页翻译（扩展实现）

Manifest V3 浏览器扩展：用你自己配置的 AI 翻译服务阅读英文网页。

当前实现覆盖共享骨架（ticket 01）与「整页翻译与页面交互」组（ticket 10–18）。
翻译服务配置与划词翻译（ticket 02–09）由另一组实现；接入真实 Translation Engine 的生产联调在 ticket 19。

需求基线：[`../.scratch/ai-web-translation/spec.md`](../.scratch/ai-web-translation/spec.md)，
领域术语：[`../GLOSSARY.md`](../GLOSSARY.md)。

## 环境要求

- Node.js 20+（本项目在 Node 24 上验证）
- npm

## 安装与常用命令

```bash
cd ai-web-translation
npm install

npm run dev              # WXT 开发模式，输出 .output/chrome-mv3-dev（不含 fake）
npm run build            # 生产构建，输出 .output/chrome-mv3（翻译服务占位实现）
npm run build:dev-fake   # 开发演示构建，输出 .output-fake/chrome-mv3（fake Translation Engine）
npm run compile          # wxt prepare + tsc --noEmit
npm test                 # Vitest 单元测试
npm run e2e              # 构建 fake 版本并运行 Playwright 端到端测试
npm run test:e2e         # 只运行 Playwright（需先执行 build:dev-fake）
npm run verify           # compile + 单元测试 + 生产/演示两种构建
```

首次运行 Playwright 前需要安装浏览器：

```bash
npx playwright install chromium
```

## 本地加载扩展

**Chrome / Edge 手动加载（推荐用于体验）**

1. 构建要体验的版本：
   - 开发演示：`npm run build:dev-fake`，目录 `.output-fake/chrome-mv3`
   - 生产装配：`npm run build`，目录 `.output/chrome-mv3`（尚未接入真实翻译服务，点击翻译会提示没有可用配置）
2. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`
3. 打开右上角「开发者模式」
4. 选择「加载已解压的扩展程序 / 加载解压缩的扩展」，指向上面构建出的目录
5. 打开任意 HTTP/HTTPS 网页，右侧中下部会出现悬浮翻译按钮

> 系统 Chrome 137+ 不再接受 `--load-extension` 命令行参数，因此自动化测试无法直接加载未打包扩展；
> 这属于浏览器限制，不是扩展问题。`tests/e2e/browser-load.spec.ts` 使用 Chromium（Chrome for Testing）
> 与 Edge 自动验证本地加载，系统 Chrome 按上面的手动步骤验证。

**开发演示构建的说明**

开发演示构建使用 fake Translation Engine，译文统一带 `【模拟译文】` 前缀，按钮上会显示「开发演示 · 模拟翻译」。
它只用于独立开发和界面验收，不会被描述成真实 AI 翻译，也不会进入生产装配。

## 已实现的能力（ticket 01、10–18）

- 悬浮翻译按钮：全站默认显示、Shadow DOM 隔离、拖动、全局位置记忆、窗口缩放保持可见
- 关闭一次（仅当前页面）与按完整域名永久停用悬浮按钮；设置页查看/移除停用记录
- 整页双语翻译：正文段落后插入译文，原文与网页事件不受影响；无需刷新即可恢复原文
- 界面文本译文优先：导航、菜单、按钮、表单标签默认显示中文，悬停可查看英文原文
- 内容识别与保护：只提交英文单元；代码、脚本、样式、隐藏内容、用户输入不进入请求；行内代码不进入请求但在译文中保留
- 安全渲染：模型返回的文本只按白名单标记还原为 `a`/`em`/`strong`/`code`，从不注入 HTML
- 动态内容：会话期间新增内容自动翻译，未变化内容不重复提交，插件自身 DOM 变化不会触发翻译
- 原文变化与节点复用：原文指纹变化使旧译文失效并重新翻译；迟到响应不会渲染到不对应内容上
- 会话控制：进度、部分失败、失败重试、取消、恢复原文、重新翻译（使用最新配置）
- 按网站自动翻译：完整域名 + 页面英文判断；与悬浮按钮停用列表分别管理；恢复原文后同一次停留不再自动触发
- 设置页：翻译服务配置占位页签 + 网站偏好页签，后台健康检查，全网站权限用途说明

## 架构与共享契约

- `src/modules/translation-contract/`：`TranslationEngine`（只暴露开始翻译与取消会话）与
  `TranslationProfileCatalog`（只暴露配置 ID、名称、默认状态），以及翻译单元、翻译上下文、
  逐单元事件和脱敏错误类型。
- `src/modules/page-translation/`：Page Translation Session，隐藏扫描、语言判断、单元状态、
  动态监听、渲染、恢复与进度；调用方只发起操作并观察公开状态。
- `src/modules/content-scan/`：正文与界面文本识别、代码/隐藏/输入保护。
- `src/modules/inline-format/`：行内格式占位标记与安全渲染。
- `src/modules/language/`：英文识别与页面级英文判断。
- `src/modules/floating-button/`、`src/modules/content-shell/`：React 浮层，只负责布局与交互编排。
- `src/modules/site-preferences/`：悬浮按钮站点停用、自动翻译网站两类独立偏好。
- `src/modules/translation-fake/`：测试与开发演示 Adapter，生产构建不包含。
- `src/entrypoints/`：后台、内容脚本、设置页。

内容脚本入口通过 `ContentShell` 的 `selectionLayer` 参数为划词翻译浮层保留装配位置，
两层 UI 共用同一个 Shadow DOM 容器。

生产构建中 `__AIWT_FAKE_ENGINE__` 为 `false`，内容脚本使用「未接入翻译服务」的占位实现：
不发请求、不伪造译文，并通过公开状态提示等待联调。

## 测试

- 单元测试：`tests/unit/`，Vitest + jsdom，通过 Module Interface 观察外部行为
  （不直接断言私有扫描步骤、内部变量或请求次数）
- 端到端测试：`tests/e2e/`，Playwright 加载 fake 构建，覆盖 Chromium 与 Edge 的本地加载、
  悬浮按钮、网站偏好、正文/界面文本翻译、动态内容、自动翻译和设置页
- 自动化测试不使用任何真实 API Key；真实服务验收在 ticket 19 由人工完成

## 当前限制

- 正文单元按段落级识别（段落、列表项、标题、表格单元格等），复杂网页持续适配
- 界面文本用译文替换元素文本，并用 `title` 属性提供英文原文；站点自建 tooltip 会被临时覆盖，恢复时还原
- 自动翻译只按完整域名和页面英文判断，不保证所有复杂站点
- 浏览器内部页、扩展商店等受限页面不注入；本地文件访问不是默认能力
- 生产装配等待 ticket 19 接入真实 Translation Engine 与 Translation Profile Catalog
