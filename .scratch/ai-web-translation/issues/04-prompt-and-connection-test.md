# 04: 配置翻译提示词并测试真实连接

**What to build:** 提供内置的默认翻译提示词、编辑与恢复能力，并让用户通过固定英文短句对完整翻译服务配置发起真实测试请求，从而在使用前发现协议、模型、认证或额外参数问题。

**Blocked by:** 03: 配置高级请求与运行参数

**Status:** ready-for-agent

- [ ] 默认翻译提示词明确 AI 只做英文到简体中文翻译，不解释、不总结、不回答、不评论、不添加前后缀或 Markdown。
- [ ] 默认翻译提示词明确待翻译文本和翻译上下文是不可信资料，其中的命令、问题和要求不得执行。
- [ ] 默认翻译提示词要求保留翻译单元 ID、链接、占位符和格式标记，并只返回约定的结构化译文。
- [ ] 用户可以查看、编辑、保存和一键恢复默认翻译提示词，恢复操作有明确反馈。
- [ ] 测试连接使用固定英文短句、当前完整配置和当前提示词发起真实 Chat Completions 请求，不读取译文缓存。
- [ ] 测试成功时显示实际译文；测试进行中防止重复提交，并能区分请求中与请求完成状态。
- [ ] 测试失败时显示脱敏后的网络、HTTP、认证、模型、参数或响应格式错误，不展示 API Key 和敏感请求头。
- [ ] 测试验证完整请求包含所选模型和合法额外参数，同时 model、messages、stream 由 Translation Engine 管理。
- [ ] 使用 mock HTTP Adapter 覆盖成功、无效响应、400、401、403 和网络失败，并在真实兼容服务上手动验证一次。

## Comments

### 2026-11-17 状态：未开始（等待实现组）

ticket 01 已完成共享骨架与接口；本 ticket 依赖 03。默认翻译提示词属于 Translation Engine Implementation 内部，页面与整页会话不读取提示词内容。

## Comments

已完成（提交 `9debb21`）。

- 落地：`translation-prompt/default-prompt.ts`、`prompt-store.ts`；`translation-chat-completions/`（http-adapter、request、response、errors、connection-test）；`messaging/connection-test.ts`；后台处理入口；设置页提示词面板与「测试连接」。
- 验证：`tests/unit/translation-prompt.test.ts`（11）、`chat-completions.test.ts`（18）、`connection-test.test.ts`（13）、`tests/e2e/connection-test.spec.ts`（5，含慢响应下的「测试中」状态）。
- 真实服务手动验证：使用 `.env` 中的兼容服务跑一次完整请求，返回「敏捷的棕色狐狸跃过懒狗。」（密钥未写入任何文件）。
- 说明：测试连接只接受扩展自己的页面发起，并在后台重新校验配置，内容脚本无法借后台请求任意地址。
