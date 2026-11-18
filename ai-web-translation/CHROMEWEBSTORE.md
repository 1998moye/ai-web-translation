# Chrome Web Store Listing — AI 网页翻译 · 英文转中文

> Last Updated: 2026-11-18
> Manifest version: 1.0.0
> Package: `store/packages/ai-web-translation-1.0.0-chrome.zip`

## Store Listing

**Extension Name** [REQUIRED]

`AI 网页翻译 · 英文转中文`

**Short Description** [REQUIRED]

`自带 AI 服务的英文网页翻译：整页双语、划词翻译。只翻英文→中文，不内置模型或密钥。`

**Detailed Description** [REQUIRED]

```text
把英文网页翻译成中文，使用你自己已经信任的 AI 服务。

这是一个只做英文→中文的浏览器翻译扩展。它不内置 AI 模型，也不提供共享 API Key；你需要先在设置页填写自己的 OpenAI 兼容 Chat Completions 地址、模型名和 API Key，费用直接结算给你的服务商。

功能
• 整页双语：保留英文原文，在段落下方显示中文译文。
• 划词翻译：选中一句英文，点击图标查看中文译文。
• 界面文本翻译：导航、按钮、表单标签优先显示中文，悬停可查看英文原文。
• 动态内容：页面新增内容或原文变化后自动处理。
• 多份配置：为不同服务商或模型保存多个翻译服务配置，随时切换默认配置。
• 可编辑提示词、译文缓存、并发/超时/重试设置。
• 按完整域名开启自动翻译；也可以永久关闭某个网站的悬浮按钮。
• 键盘可操作，支持深色模式与减少动态效果。

使用步骤
1. 安装扩展，打开设置页的“翻译服务”。
2. 新建配置，填写兼容 OpenAI Chat Completions 的完整地址、模型名和 API Key。
3. 打开任意英文网页，点击右侧悬浮按钮开始整页翻译；选中文字可划词翻译。
4. 再次点击悬浮按钮可恢复原文。

重要说明
• 只支持英文→中文；不提供中文→英文或其他语言对。
• 不内置模型、不赠送额度、不提供 API Key。必须自行配置 AI 服务。
• 翻译请求直接发送到你填写的服务地址，不经过扩展开发者。
• API Key、配置与译文缓存只保存在本机扩展存储中。

隐私与权限
扩展需要“读取和更改您在所有网站上的数据”权限，用于在普通网页显示悬浮翻译按钮，并在你点击翻译或开启自动翻译后读取页面英文并插入中文译文。扩展不会自动上传页面；浏览器内部页、扩展商店等受保护页面不会被注入。
扩展不包含分析、广告或遥测；不出售用户数据。完整说明见隐私政策。

支持
遇到问题或有建议，请联系：{{SUPPORT_EMAIL}}
```

**Category** [REQUIRED]

`Productivity`

**Single Purpose** [REQUIRED]

`在用户自行配置的 AI 翻译服务下，把英文网页翻译成中文。`

**Primary Language** [REQUIRED]

`Chinese (Simplified) — zh-CN`

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `store/assets/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ✅ Ready | `store/assets/screenshots/01-page-translation.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ✅ Ready | `store/assets/screenshots/02-selection-translation.png` |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ✅ Ready | `store/assets/screenshots/03-your-own-ai.png` |
| Small Promo Tile [RECOMMENDED] | 440×280 | ✅ Ready | `store/assets/promo-small-440x280.png` |
| Marquee Promo Tile | 1400×560 | ✅ Ready | `store/assets/promo-large-1400x560.png` |

### Screenshot Notes

1. **整页双语**：英文文章下方显示中文译文，右侧为悬浮按钮；顶部明确只支持英文→中文。
2. **划词翻译**：选中英文句子后显示中文气泡，并展示翻译服务选择器。
3. **自带 AI**：设置页顶部提示“只做英文→中文、不内置模型”，下方是用户自己的服务配置；API Key 已脱敏。

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | 在本机保存翻译服务配置、API Key、提示词、译文缓存、网站自动翻译偏好、悬浮按钮停用列表和按钮位置。不会同步到云端，也不会上传给开发者。 |
| `http://*/*` | host_permissions | 在所有普通 HTTP 网页显示悬浮翻译按钮；只有用户点击翻译或为该网站开启自动翻译后，才读取页面文字并插入中文译文。 |
| `https://*/*` | host_permissions | 在所有普通 HTTPS 网页显示悬浮翻译按钮；只有用户点击翻译或为该网站开启自动翻译后，才读取页面文字并插入中文译文。 |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes — limited to user-provided service credentials and page text explicitly sent to the user's own AI endpoint.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | — | No |
| Health info | No | No | — | No |
| Financial info | No | No | — | No |
| Authentication info | Yes — API Key entered by the user | Yes — only to the user-configured AI endpoint as an auth header | Authenticate the user's own AI service | No developer/other third party |
| Personal communications | No | No | — | No |
| Location | No | No | — | No |
| Web history | No | No | — | No |
| User activity | No | No | — | No |
| Website content | Yes — only selected text/page text after user action or site auto-translate | Yes — only to the user-configured AI endpoint | Translate English into Chinese | No developer/other third party |

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

`[待部署]` — 本地文件：`store/privacy-policy.html` / `store/privacy-policy.md`

发布前需要放到公开 HTTPS 地址，并把 `{{SUPPORT_EMAIL}}` 替换为真实支持邮箱。GitHub Pages 或公开 Gist 均可；确认无痕窗口能打开。

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]

`{{PUBLISHER_NAME}}`（建议使用 qinkp 或你的个人/公司公开名称）

**Contact Email** [REQUIRED]

`{{SUPPORT_EMAIL}}`

**Support URL / Email** [RECOMMENDED]

`{{SUPPORT_EMAIL}}`

**Homepage URL** [RECOMMENDED]

`[可选]`

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-11-18 | 首次提交：英文→中文、整页双语、划词翻译、自带 AI 配置、缓存与网站偏好 | Draft |

## Review Notes

### Reviewer test instructions

This is a bring-your-own-AI extension. It does not include a built-in model, API key, or translation server. To test the full translation flow, add a test profile in Settings → 翻译服务 with an OpenAI-compatible Chat Completions endpoint, model, and API key. A low-quota temporary key can be supplied privately in the certification notes; do not commit it to the repository.

Suggested flow:

1. Open the extension options page.
2. Create a profile with a complete Chat Completions URL, model, and API key.
3. Open an English article page (for example a public documentation page).
4. Click the floating button on the right; original English should remain and Chinese translations should appear below paragraphs.
5. Select an English sentence and click the small translate icon; a Chinese bubble should appear.
6. Click the floating button again to restore the original page.
7. Try a page with no profile configured; the UI should explain that a profile is required instead of crashing.

### Known Issues / Limitations

- Only English → Chinese; other language pairs are intentionally unsupported.
- Translation requires a user-configured OpenAI-compatible service; no built-in model or shared key.
- Browser internal pages, extension store pages, and other protected pages cannot be injected.
- The extension requests broad host access because it works on all ordinary HTTP/HTTPS sites; page text is read only after the user triggers translation or enables auto-translate for that site.
- No remote code; all JavaScript is bundled in the package.

### Rejection History

| Date | Reason | Fix Applied | Resubmitted |
|------|--------|-------------|-------------|
| — | — | — | — |
