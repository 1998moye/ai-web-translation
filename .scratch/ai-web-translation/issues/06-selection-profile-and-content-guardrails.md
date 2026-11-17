# 06: 支持划词切换配置与内容保护

**What to build:** 用户可以在划词翻译时选择其他翻译服务配置，并获得明确的不可翻译内容反馈。非英文和代码内容不会被提交，关闭气泡不会产生额外请求。

**Blocked by:** 05: 完成默认配置下的划词翻译

**Status:** ready-for-human

- [ ] 划词气泡可以列出 Translation Profile Catalog 中的配置摘要，并标识当前配置。
- [ ] 用户可以选择另一份有效配置翻译当前选区，新结果不能与之前配置的结果混淆。
- [ ] 配置切换只暴露配置 ID 和名称，不向内容脚本泄露密钥或敏感请求头。
- [ ] 非英文、已有中文、纯数字和纯符号选区不会发起翻译请求，并显示适当反馈。
- [ ] 代码块、命令、参数名和行内代码等代码内容不会发起翻译请求，并显示适当反馈。
- [ ] 中英混排选区只处理英文内容，不修改已有中文。
- [ ] 关闭气泡、取消选择或打开新气泡不会仅因界面操作产生额外请求。
- [ ] 配置被删除或不可用时会提示用户选择其他配置，不发送无效请求。
- [ ] 测试覆盖配置切换、不可用配置、语言识别、代码保护和混排选区。

## Comments

### 2026-11-17 状态：未开始（等待实现组）

本 ticket 依赖 05。语言识别（`src/modules/language/language.ts`）与内容保护（`src/modules/content-scan/`、`src/modules/inline-format/`）已由整页组实现，可在不改变共享 Interface 的前提下复用；划词气泡的配置切换只使用 Translation Profile Catalog 摘要。

## Comments

已完成（提交 `38dc526`）。

- 落地：气泡内的配置下拉（只含 ID 与名称）与 `selectProfile`；`translation-segments.ts` 提取英文片段；选区读取排除 `pre/code/kbd/samp/var/tt` 内容并给出代码提示。
- 验证：`tests/unit/selection-segments.test.ts`（8）、`selection-translation.test.ts` 的配置切换、不可用配置、语言与代码保护、混排用例；生产 e2e 覆盖切换配置不混用、代码内容不进入请求。
- 说明：不可翻译选区仍显示图标但标记为不可用，点击只说明原因、不发起请求——这是「显示适当反馈」的实现方式。
