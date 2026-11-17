import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { test } from '../e2e/helpers/extension';

/**
 * 生产装配验收：构建产物里不能出现 fake Translation Engine 或伪造译文。
 * 开发演示构建（AIWT_FAKE_ENGINE=1）单独输出到 .output-fake，不在此目录。
 */
test('生产构建不包含 fake Engine 或模拟译文', async () => {
  const root = '.output/chrome-mv3';
  const scripts = (await walk(root)).filter((file) => file.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(0);

  const offenders: string[] = [];
  for (const file of scripts) {
    const text = await readFile(file, 'utf8');
    if (/模拟译文|FakeTranslationEngine|开发演示/.test(text)) offenders.push(path.relative(root, file));
  }

  expect(offenders).toEqual([]);
});

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}
