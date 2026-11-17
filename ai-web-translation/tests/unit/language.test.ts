import { describe, expect, it } from 'vitest';
import { classifyText, summarizePageLanguage } from '@/modules/language/language';

describe('classifyText', () => {
  it('识别英文正文', () => {
    expect(classifyText('The quick brown fox jumps over the lazy dog.')).toBe('english');
    expect(classifyText('This extension reads the page and translates it.')).toBe('english');
  });

  it('把已有中文内容判为非英文', () => {
    expect(classifyText('这是一段中文内容。')).toBe('non-english');
    expect(classifyText('使用 React 构建界面')).toBe('non-english');
  });

  it('把明显非英文语言判为非英文', () => {
    expect(classifyText('Le chat est noir et les chiens sont grands.')).toBe('non-english');
    expect(classifyText('Der schnelle Fuchs springt über den faulen Hund.')).toBe('non-english');
    expect(classifyText('El perro corre por el parque con los niños.')).toBe('non-english');
  });

  it('纯数字、符号和空白不提交翻译', () => {
    expect(classifyText('12345 67.89')).toBe('untranslatable');
    expect(classifyText('— · © 2024')).toBe('untranslatable');
    expect(classifyText('   ')).toBe('untranslatable');
  });

  it('短界面标签按英文处理', () => {
    expect(classifyText('Sign in')).toBe('english');
    expect(classifyText('Documentation')).toBe('english');
    expect(classifyText('OK')).toBe('english');
  });

  it('忽略行内格式标记', () => {
    expect(classifyText('Run ⟦o1⟧ to install ⟦w1⟧the package⟦/w1⟧')).toBe('english');
  });
});

describe('summarizePageLanguage', () => {
  it('英文页面触发自动翻译', () => {
    const summary = summarizePageLanguage([
      'The quick brown fox jumps over the lazy dog.',
      'This is a guide about the extension.',
      'Read more about it in the documentation.',
    ]);
    expect(summary.isEnglish).toBe(true);
    expect(summary.englishUnits).toBe(3);
  });

  it('非英文页面不触发自动翻译', () => {
    const summary = summarizePageLanguage([
      'Le chat est noir et les chiens sont grands.',
      'Une maison avec un jardin pour les enfants.',
      'Nous avons aussi une voiture dans le garage.',
    ]);
    expect(summary.isEnglish).toBe(false);
    expect(summary.englishUnits).toBe(0);
  });

  it('中文页面不触发自动翻译', () => {
    const summary = summarizePageLanguage(['这是一段中文内容。', '这个页面已经全部是中文。']);
    expect(summary.isEnglish).toBe(false);
    expect(summary.chineseUnits).toBe(2);
  });

  it('中英混排页面只把英文单元计入判断', () => {
    const summary = summarizePageLanguage([
      '这是一段中文说明。',
      'The quick brown fox jumps over the lazy dog near the river.',
      'Another English paragraph about the same topic.',
    ]);
    expect(summary.isEnglish).toBe(true);
    expect(summary.englishUnits).toBe(2);
    expect(summary.chineseUnits).toBe(1);
  });

  it('内容太少时不触发自动翻译', () => {
    expect(summarizePageLanguage(['Home']).isEnglish).toBe(false);
  });
});
