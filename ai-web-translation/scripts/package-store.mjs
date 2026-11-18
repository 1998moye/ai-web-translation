import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, '.output', 'chrome-mv3');
const packageDir = path.join(root, 'store', 'packages');
const manifestPath = path.join(buildDir, 'manifest.json');

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  console.error('Missing .output/chrome-mv3/manifest.json. Run `npm run build` first.');
  process.exit(1);
}

if (manifest.manifest_version !== 3) {
  console.error('Refusing to package: manifest_version is not 3.');
  process.exit(1);
}

for (const [size, relativePath] of Object.entries(manifest.icons ?? {})) {
  const file = path.join(buildDir, relativePath);
  try {
    const bytes = await readFile(file);
    if (bytes.subarray(1, 4).toString() !== 'PNG') throw new Error('not a PNG');
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width !== Number(size) || height !== Number(size)) {
      throw new Error(`expected ${size}x${size}, got ${width}x${height}`);
    }
  } catch (error) {
    console.error(`Icon check failed for ${relativePath}: ${error.message}`);
    process.exit(1);
  }
}

await mkdir(packageDir, { recursive: true });
const baseName = `ai-web-translation-${manifest.version}`;
const zipPath = path.join(packageDir, `${baseName}.zip`);
await unlink(zipPath).catch(() => {});

const sevenZip = spawnSync('7z', ['a', '-tzip', '-mx=9', zipPath, '.'], {
  cwd: buildDir,
  encoding: 'utf8',
});
if (sevenZip.status !== 0) {
  console.error(sevenZip.stderr || sevenZip.stdout || '7z failed');
  process.exit(1);
}

const chromePath = path.join(packageDir, `${baseName}-chrome.zip`);
const edgePath = path.join(packageDir, `${baseName}-edge.zip`);
await copyFile(zipPath, chromePath);
await copyFile(zipPath, edgePath);
await unlink(zipPath);

const bytes = await readFile(chromePath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const size = (await stat(chromePath)).size;
const entries = await readdir(buildDir, { recursive: true });

console.log(`Packaged ${manifest.name} v${manifest.version}`);
console.log(`- ${path.relative(root, chromePath)}`);
console.log(`- ${path.relative(root, edgePath)}`);
console.log(`- entries: ${entries.length}; size: ${(size / 1024).toFixed(1)} KiB`);
console.log(`- sha256: ${sha256}`);
