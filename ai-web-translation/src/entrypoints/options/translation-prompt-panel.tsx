import { useEffect, useState } from 'react';
import {
  DEFAULT_TRANSLATION_PROMPT,
} from '@/modules/translation-prompt/default-prompt';
import {
  InvalidPromptError,
  type TranslationPromptRepository,
} from '@/modules/translation-prompt/prompt-store';

export interface TranslationPromptPanelProps {
  repository: TranslationPromptRepository;
}

export function TranslationPromptPanel({ repository }: TranslationPromptPanelProps) {
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void repository.read().then((current) => {
      if (!active) return;
      setText(current);
      setSavedText(current);
    });
    const unsubscribe = repository.watch((current) => {
      setText(current);
      setSavedText(current);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  const isCustom = savedText !== DEFAULT_TRANSLATION_PROMPT;
  const dirty = text !== savedText;

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await repository.save(text);
      setStatus('翻译提示词已保存，新的翻译请求会使用它。');
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof InvalidPromptError ? cause.message : '保存失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  const restoreDefault = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await repository.reset();
      setStatus('已恢复内置默认翻译提示词。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aiwt-panel">
      <section aria-labelledby="aiwt-prompt-heading">
        <h2 id="aiwt-prompt-heading">翻译提示词</h2>
        <p className="aiwt-hint">
          提示词约束翻译服务的行为。它必须继续要求按单元 ID 返回
          {' '}
          <code>{'{"translations":[{"id","text"}]}'}</code>
          {' '}
          结构，并保留占位标记。改完后可以用「测试连接」确认服务仍能按协议返回。
        </p>

        {status && (
          <p className="aiwt-status" role="status">
            {status}
          </p>
        )}
        {error && (
          <p className="aiwt-issues" role="alert">
            {error}
          </p>
        )}

        <div className="aiwt-field">
          <label htmlFor="aiwt-prompt-text">提示词内容{isCustom ? '（自定义）' : '（内置默认）'}</label>
          <textarea
            id="aiwt-prompt-text"
            rows={12}
            value={text}
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
          />
          <p className="aiwt-field-hint">
            {dirty ? '有未保存的修改，翻译请求仍使用已保存的提示词。' : '当前内容与已保存的提示词一致。'}
          </p>
        </div>

        <div className="aiwt-form-actions">
          <button type="button" className="aiwt-primary" disabled={busy || !dirty} onClick={() => void save()}>
            保存提示词
          </button>
          <button type="button" disabled={busy || !isCustom} onClick={() => void restoreDefault()}>
            恢复默认
          </button>
        </div>
      </section>
    </div>
  );
}
