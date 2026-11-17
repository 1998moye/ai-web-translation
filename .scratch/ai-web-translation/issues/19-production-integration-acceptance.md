# 19: 接入真实 Translation Engine 并完成端到端验收

**What to build:** 将整页翻译和划词翻译接入同一个生产 Translation Engine 与 Translation Profile Catalog，移除生产装配中的 fake，并通过可控模拟服务和真实翻译服务验收完整用户流程及代表网站。

**Blocked by:** 09: 完成翻译任务控制；11: 完成悬浮按钮关闭与网站停用管理；18: 支持按网站自动翻译

**Status:** ready-for-agent

- [ ] 整页翻译通过真实 Translation Profile Catalog 选择配置，并通过生产 Translation Engine 发起请求，内容脚本仍不能读取密钥。
- [ ] 划词与整页翻译共享一致的提示词、分批、缓存、任务控制和脱敏错误行为，不出现两套重复请求实现。
- [ ] 生产装配不包含 fake Translation Engine 或伪造译文，开发和测试 Adapter 仍可独立使用。
- [ ] 使用可控模拟 Chat Completions 服务完成设置、划词、整页、动态新增、原文变化、缓存、取消、失败重试和重新翻译的端到端测试。
- [ ] 验证成功批次、无效结构、单元 ID 错误、400、401、403、429、5xx、超时和乱序响应的完整用户表现。
- [ ] 验证悬浮按钮拖动、单次关闭、完整域名永久关闭、网站移除、自动翻译列表和两类网站偏好的独立性。
- [ ] 在 MDN、英文 Wikipedia、BBC、GitHub 和 Stack Overflow 的代表页面手动检查正文、界面文本、代码保护、格式、动态内容和恢复原文。
- [ ] 使用用户提供的真实兼容服务与测试密钥手动验证一次完整流程，不把密钥写入代码、测试、日志或 ticket。
- [ ] Chrome 和 Edge 均完成本地加载和核心流程检查，项目的构建与测试命令全部通过。
- [ ] 联调只修复装配和已定义行为的集成问题；新的网站兼容缺陷记录为独立 ticket，不在本 ticket 中无限扩大范围。

## Comments

### 2026-11-17 状态：未开始（等待联调）

- 已完成：01（共享骨架）、10–18（整页翻译与页面交互），后者使用 fake Translation Engine 独立验收，端到端证据见各 ticket 的 Comments。
- 未完成：02–09（翻译服务配置、提示词与划词翻译）。按 `Blocked by`，09 完成后才能开始本 ticket。
- 当前生产构建（`npm run build`）使用占位 Translation Engine：不发请求、不伪造译文；`npm run build:dev-fake` 才包含 fake Adapter，生产装配未混入 fake。
- 联调可直接使用的入口：`src/modules/assembly/content-assembly.ts` 中的 engine/profiles 装配、`src/entrypoints/options/translation-profiles-panel.tsx` 的配置页签占位。
