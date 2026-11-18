import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storeDir = path.join(root, 'store');
const assetsDir = path.join(storeDir, 'assets');
const iconsDir = path.join(root, 'public', 'icons');

const fullSvg = await readFile(path.join(storeDir, 'icon.svg'), 'utf8');
const smallSvg = await readFile(path.join(storeDir, 'icon-small.svg'), 'utf8');
const iconDataUrl = `data:image/svg+xml;base64,${Buffer.from(fullSvg).toString('base64')}`;

await mkdir(assetsDir, { recursive: true });
await mkdir(iconsDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chromium', headless: true });

async function renderSvg(svg, size, outputPath) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: outputPath, omitBackground: true });
  await page.close();
}

for (const [size, source] of [
  [16, smallSvg],
  [32, smallSvg],
  [48, fullSvg],
  [128, fullSvg],
]) {
  await renderSvg(source, size, path.join(iconsDir, `icon-${size}.png`));
}

await renderSvg(fullSvg, 128, path.join(assetsDir, 'icon-128.png'));
await renderSvg(fullSvg, 300, path.join(assetsDir, 'icon-300.png'));

function promoHtml({ width, height, iconSize, titleSize, subSize, eyebrowSize, padding, gap }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background:
      radial-gradient(circle at 12% 18%, rgba(42, 157, 143, 0.12), transparent 24%),
      radial-gradient(circle at 88% 82%, rgba(239, 111, 83, 0.12), transparent 28%),
      #fff9ea;
    color: #2d2a26;
    font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
  }
  .card {
    display: flex;
    align-items: center;
    gap: ${gap}px;
    width: calc(100% - ${padding * 2}px);
    height: calc(100% - ${padding * 2}px);
    padding: ${padding}px;
    border: 4px solid #2d2a26;
    border-radius: ${Math.round(iconSize * 0.22)}px;
    background: #fffaf0;
    box-shadow: 10px 10px 0 #2d2a26;
  }
  .icon {
    flex: 0 0 auto;
    width: ${iconSize}px;
    height: ${iconSize}px;
    filter: drop-shadow(3px 3px 0 rgba(45, 42, 38, 0.18));
  }
  .copy { min-width: 0; }
  .eyebrow {
    display: inline-block;
    margin-bottom: ${Math.round(eyebrowSize * 0.45)}px;
    padding: ${Math.round(eyebrowSize * 0.28)}px ${Math.round(eyebrowSize * 0.55)}px;
    border: 2px solid #2d2a26;
    border-radius: 999px;
    background: #ffd166;
    font-size: ${eyebrowSize}px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  .title {
    margin: 0;
    font-size: ${titleSize}px;
    line-height: 1.12;
    font-weight: 900;
    letter-spacing: -0.035em;
    white-space: nowrap;
  }
  .title em { font-style: normal; color: #e05d43; }
  .sub {
    margin: ${Math.round(subSize * 0.55)}px 0 0;
    color: #6f6455;
    font-size: ${subSize}px;
    font-weight: 600;
    white-space: nowrap;
  }
  .chips { display: flex; gap: ${Math.round(subSize * 0.45)}px; margin-top: ${Math.round(subSize * 0.6)}px; }
  .chips span {
    padding: ${Math.round(subSize * 0.28)}px ${Math.round(subSize * 0.55)}px;
    border: 2px solid #2d2a26;
    border-radius: 9px;
    background: #fff3d4;
    font-size: ${Math.round(subSize * 0.82)}px;
    font-weight: 700;
    white-space: nowrap;
  }
</style>
</head>
<body>
  <div class="card">
    <img class="icon" src="${iconDataUrl}" alt="">
    <div class="copy">
      <div class="eyebrow">AI 网页翻译</div>
      <p class="title">英文网页<br><em>翻成中文</em></p>
      <p class="sub">自带 AI 服务 · 不内置模型</p>
      <div class="chips"><span>整页双语</span><span>划词翻译</span></div>
    </div>
  </div>
</body>
</html>`;
}

async function renderPromo(config, outputPath) {
  const page = await browser.newPage({
    viewport: { width: config.width, height: config.height },
    deviceScaleFactor: 1,
  });
  await page.setContent(promoHtml(config));
  await page.screenshot({ path: outputPath });
  await page.close();
}

await renderPromo(
  {
    width: 440,
    height: 280,
    iconSize: 126,
    titleSize: 32,
    subSize: 15,
    eyebrowSize: 12,
    padding: 24,
    gap: 22,
  },
  path.join(assetsDir, 'promo-small-440x280.png'),
);

await renderPromo(
  {
    width: 1400,
    height: 560,
    iconSize: 300,
    titleSize: 68,
    subSize: 27,
    eyebrowSize: 22,
    padding: 64,
    gap: 54,
  },
  path.join(assetsDir, 'promo-large-1400x560.png'),
);

await browser.close();

await writeFile(
  path.join(assetsDir, 'README.md'),
  `# 商店图形素材\n\n- \`npm run store:assets\` 生成图标、商店 Logo 与宣传图。\n- \`npm run store:screenshots\` 生成 1280×800 的商店截图。\n\n文件：\n\n- \`icon-128.png\`：Chrome Web Store 图标\n- \`icon-300.png\`：Edge Add-ons 商店 Logo\n- \`promo-small-440x280.png\`：Chrome / Edge 小型宣传图\n- \`promo-large-1400x560.png\`：Chrome / Edge 大型宣传图\n- \`screenshots/\`：3 张 1280×800 商店截图\n`,
);

console.log('Generated extension icons, store icons, and promo tiles.');
