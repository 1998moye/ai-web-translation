# 01: 建立扩展骨架与共享契约

**What to build:** 建立可被 Chrome 和 Edge 加载的 Manifest V3 扩展骨架，使后台、设置页和内容脚本能够通信，并为两组实现提供稳定的 Translation Engine、Translation Profile Catalog、共享数据类型和测试 Adapter。记录全网站访问权限的架构决策，但不实现具体翻译功能。

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] 使用 TypeScript、WXT 和 React 建立可构建、可加载的扩展，后台、设置页和内容脚本的健康检查流程可用。
- [x] 声明所有 HTTP/HTTPS 网站所需的权限与内容脚本匹配，权限用途说明与 ADR-0001 一致，不加入扩展内逐站授权流程。
- [x] 设置页为翻译服务配置和网站偏好提供独立页签占位，内容入口为划词与整页功能保留清晰装配位置，避免两组修改同一面板。
- [x] Translation Engine Interface 只暴露开始翻译和取消会话；开始翻译接收会话 ID、请求 ID、配置 ID、翻译单元和翻译上下文，并返回可逐批消费的事件。
- [x] Translation Profile Catalog Interface 只暴露只读配置摘要和默认配置，不向内容脚本暴露 API Key、敏感请求头或完整配置。
- [x] 共享类型能够表达正文与界面文本翻译单元、只读翻译上下文、逐单元成功、逐单元失败、完成和脱敏错误。
- [x] 提供测试用 Translation Engine 与 Translation Profile Catalog Adapter，可模拟成功、延迟、部分失败、乱序事件和取消；生产装配不使用 fake。
- [x] 建立 Vitest 与 Playwright 的最小可运行验证，覆盖构建、健康检查和共享契约的基本行为。
- [x] 记录安装、构建、测试和本地加载命令，并确认 Chrome 与 Edge 均能完成本地加载。

## Comments

### 2026-11-17 实现完成，等待人工验收

实现位置：根目录下的项目目录 `ai-web-translation/`（`package.json`、`wxt.config.ts`、`src/`、`tests/`、`README.md`）。

完成内容：

- TypeScript + WXT + React + Manifest V3；`npm run build` 输出 `.output/chrome-mv3`，`npm run dev` 可开发调试。
- manifest 声明 `storage` 与 `http://*/*`、`https://*/*` 主机权限；`action` 打开设置页；没有扩展内逐站授权流程，与 ADR-0001 一致。
- 设置页两个独立页签：翻译服务配置（占位，02–09 负责）与网站偏好（11/18 已实现）；页脚说明全网站权限用途。
- 内容脚本入口 `ContentShell` 为划词翻译浮层保留 `selectionLayer` 装配位置，两层 UI 共用同一个 Shadow DOM，避免两组修改同一面板。
- Translation Engine Interface 只暴露 `translate(request)`（返回可逐批消费的事件流）与 `cancelSession(sessionId)`；请求携带会话 ID、请求 ID、配置 ID、翻译单元与只读翻译上下文；事件含逐单元成功、逐单元失败、请求完成和脱敏错误。
- Translation Profile Catalog Interface 只返回 `{ id, name, isDefault }`，不含 API Key、敏感请求头或完整配置。
- 共享类型覆盖正文/界面文本翻译单元、只读翻译上下文、逐单元结果、完成事件与脱敏错误。
- fake Translation Engine 与 fake Profile Catalog 支持成功、延迟、乱序、部分失败和取消；生产构建使用占位 Engine（不发请求、不伪造译文），fake 只用于测试与 `npm run build:dev-fake`。
- 后台健康检查（内容脚本与设置页共用）；内容脚本通过后台打开设置页（内容脚本自身不能调用 `runtime.openOptionsPage`）。
- README 记录安装、构建、测试、本地加载命令，以及系统 Chrome 手动加载步骤。

验收证据：

- `npm run compile`：通过（`wxt prepare` + `tsc --noEmit`，无错误）。
- `npm test`：8 个测试文件、97 个用例全部通过。
- `npm run build` 与 `npm run build:dev-fake`：均通过，输出 `.output/chrome-mv3` 与 `.output-fake/chrome-mv3`。
- `npm run e2e`：16 个用例通过、1 个跳过。跳过项为系统 Chrome 137+ 不再接受 `--load-extension`（浏览器限制），README 已给出 `chrome://extensions` 手动加载步骤；Chromium（Chrome for Testing）与 Edge 的本地加载、内容脚本与设置页健康检查均由自动化验证通过。
