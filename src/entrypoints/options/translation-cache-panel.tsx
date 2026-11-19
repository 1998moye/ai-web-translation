import { useEffect, useState } from 'react';
import type { TranslationCache } from '@/modules/translation-cache/translation-cache';

export interface TranslationCachePanelProps {
  cache: TranslationCache;
}

export function TranslationCachePanel({ cache }: TranslationCachePanelProps) {
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void cache.count().then((next) => {
      if (active) setCount(next);
    });
    return () => {
      active = false;
    };
  }, [cache]);

  const clear = async (): Promise<void> => {
    setBusy(true);
    try {
      await cache.clear();
      setCount(await cache.count());
      setStatus('译文缓存已清空。翻译服务配置与网站偏好保持不变。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aiwt-panel">
      <section aria-labelledby="aiwt-cache-heading">
        <h2 id="aiwt-cache-heading">译文缓存</h2>
        <p className="aiwt-hint">
          成功译文保存在本机，相同原文在相同服务、模型、提示词和请求参数下会直接复用。缓存不保存 API Key。
        </p>

        {status && (
          <p className="aiwt-status" role="status">
            {status}
          </p>
        )}

        <p className="aiwt-cache-count">
          当前缓存条目：<strong>{count === null ? '读取中…' : count}</strong>
        </p>

        <div className="aiwt-form-actions">
          <button type="button" disabled={busy} onClick={() => void clear()}>
            清空译文缓存
          </button>
        </div>
      </section>
    </div>
  );
}
