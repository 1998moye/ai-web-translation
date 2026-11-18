# Microsoft Edge Add-ons Listing — AI 网页翻译 · 英文转中文

> Last Updated: 2026-11-18
> Manifest version: 1.0.0
> Package: `store/packages/ai-web-translation-1.0.0-edge.zip`
> Partner Center: https://partner.microsoft.com/dashboard/microsoftedge/

## Manifest-derived fields (read-only in Partner Center)

Edge fills the following from `manifest.json`. Do not edit them in the listing form; re-upload the package if they need to change.

- **Extension name**: `AI 网页翻译 · 英文转中文`
- **Short description**: `自带 AI 服务的英文网页翻译：整页双语与划词翻译，只翻英文→中文，不内置模型或密钥。`

## Store Listing

**Category**

`Productivity`

**Detailed description**

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

支持：q1806314252@gmail.com
```

**Search terms**

`英文翻译`, `网页翻译`, `划词翻译`, `AI 翻译`, `双语网页`, `English to Chinese`, `web translator`, `bilingual reading`

**Primary language**

`Chinese (Simplified)`

**Additional language (recommended)**

`English` — copy the English listing from `store/listing-en.md`.

## Graphics & Assets

| Asset | Requirement | Status | Filename |
|-------|-------------|--------|----------|
| Extension logo | 1:1, recommended 300×300, minimum 128×128 | ✅ Ready | `store/assets/icon-300.png` |
| Screenshot 1 | 1280×800 or 640×480, max 6 | ✅ Ready | `store/assets/screenshots/01-page-translation.png` |
| Screenshot 2 | 1280×800 or 640×480, max 6 | ✅ Ready | `store/assets/screenshots/02-selection-translation.png` |
| Screenshot 3 | 1280×800 or 640×480, max 6 | ✅ Ready | `store/assets/screenshots/03-your-own-ai.png` |
| Small promotional tile | 440×280 | ✅ Ready | `store/assets/promo-small-440x280.png` |
| Large promotional tile | 1400×560 | ✅ Ready | `store/assets/promo-large-1400x560.png` |

## Privacy

**Single purpose**

`在用户自行配置的 AI 翻译服务下，把英文网页翻译成中文。`

**Permission justification**

- `storage` — 在本机保存翻译服务配置、API Key、提示词、译文缓存、网站自动翻译偏好、悬浮按钮停用列表和按钮位置；不会同步到云端，也不会上传给开发者。
- `http://*/*` / `https://*/*` — 在所有普通 HTTP/HTTPS 网页显示悬浮翻译按钮；只有用户点击翻译或为该网站开启自动翻译后，才读取页面文字并插入中文译文。浏览器内部页、扩展商店等受保护页面不会注入。

**Are you using remote code?**

`No.` 所有 JavaScript 都打包在扩展安装包内；翻译请求只返回 JSON 文本，不执行远程代码。

**Data usage disclosure**

- Website content: yes — selected text or page text is sent only to the AI endpoint configured by the user, after an explicit action or site auto-translate.
- Authentication information: yes — the user-entered API key is stored locally and sent only to that configured endpoint as an authentication header.
- No browsing history, location, health, financial, personal communications, or analytics data is collected.
- Data is not sold, not used for unrelated purposes, and not used for creditworthiness.

**Privacy policy URL**

`https://1998moye.github.io/ai-web-translation-privacy/`

Deployed to GitHub Pages. Verified on 2026-11-18 with a private window: HTTP 200 and the support email is visible. Local source: `store/privacy-policy.html`.

## Certification Testing Notes

This extension uses a bring-your-own-AI model. It has no built-in model, API key, or developer-operated translation server. To test translation end-to-end, configure a test profile in **Settings → 翻译服务** with an OpenAI-compatible Chat Completions endpoint, model, and API key. A temporary low-quota key can be added privately in the certification notes; never commit it to the repository.

1. Open the options page and create a profile.
2. Open an English article.
3. Click the floating button on the right; English should remain and Chinese translations should appear below paragraphs.
4. Select an English sentence and click the small translate icon; a Chinese bubble should appear.
5. Click the floating button again to restore the original page.
6. With no profile configured, verify the UI explains what is missing instead of crashing.

## Developer Info

**Publisher display name**: `dz`
**Contact email**: `q1806314252@gmail.com`
**Support URL**: `q1806314252@gmail.com` or a public issue tracker
**Website**: optional

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-11-18 | First submission | Draft |

## Edge-specific notes

- Registration in the Microsoft Edge program is free; a Microsoft account and Partner Center developer account are required.
- The Edge package is the same ZIP as Chrome Web Store; the logo and promotional tiles are uploaded separately in Partner Center.
- Edge reads the extension name and short description from the package manifest; update the manifest and re-upload if those change.
- Edge store listing screenshots accept 1280×800; the generated 1280×800 screenshots are compatible with both stores.
- Review usually takes several business days; a first submission can take longer while account verification completes.
