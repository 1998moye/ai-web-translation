import { describe, expect, it } from 'vitest';
import { extractTranslatableSegments } from '@/modules/selection-translation/translation-segments';

describe('extractTranslatableSegments', () => {
  it('整段英文作为一个片段提交', () => {
    expect(extractTranslatableSegments('The quick brown fox jumps over the lazy dog.')).toEqual([
      'The quick brown fox jumps over the lazy dog.',
    ]);
  });

  it('多句英文按句子拆分，保持原文顺序', () => {
    expect(extractTranslatableSegments('First sentence. Second sentence! Third one?')).toEqual([
      'First sentence.',
      'Second sentence!',
      'Third one?',
    ]);
  });

  it('纯中文、纯数字和纯符号没有可翻译片段', () => {
    expect(extractTranslatableSegments('这是一段已经存在的中文内容。')).toEqual([]);
    expect(extractTranslatableSegments('123 456 7890')).toEqual([]);
    expect(extractTranslatableSegments('—— ··· ### 42%%')).toEqual([]);
  });

  it('中英混排只保留英文片段', () => {
    expect(extractTranslatableSegments('Read the documentation 阅读文档 and run npm install')).toEqual([
      'Read the documentation',
      'and run npm install',
    ]);
  });

  it('中文句子夹在英文之间时保留两侧英文', () => {
    expect(extractTranslatableSegments('Configure the service. 这是中文说明。 Then restart it.')).toEqual([
      'Configure the service.',
      'Then restart it.',
    ]);
  });

  it('换行与缩进被折叠成空格，句子仍分别处理', () => {
    expect(extractTranslatableSegments('  Open   the settings page. \n\n  Save   your changes. ')).toEqual([
      'Open the settings page.',
      'Save your changes.',
    ]);
  });

  it('没有内容时返回空列表', () => {
    expect(extractTranslatableSegments('')).toEqual([]);
    expect(extractTranslatableSegments('   \n  ')).toEqual([]);
  });

  it('明显非英文的拉丁文本不提交', () => {
    expect(extractTranslatableSegments('Le chat est noir et les chiens sont grands dans cette maison.')).toEqual(
      [],
    );
  });
});
