import { useEffect, useState } from 'react';
import { requestConnectionTest } from '@/modules/messaging/connection-test';
import { maskApiKey } from '@/modules/translation-profile/profile';
import { toDraft, toFormValues, type ProfileFormValues } from '@/modules/translation-profile/profile-form';
import {
  EMPTY_PROFILE_STATE,
  InvalidProfileError,
  type TranslationProfileRepository,
  type TranslationProfileState,
} from '@/modules/translation-profile/profile-store';
import type { ProfileValidationIssue } from '@/modules/translation-profile/profile-validation';
import type { TranslationPromptRepository } from '@/modules/translation-prompt/prompt-store';
import { ProfileEditor, type ConnectionTestState } from './profile-editor';

export interface TranslationProfilesPanelProps {
  repository: TranslationProfileRepository;
  promptRepository: TranslationPromptRepository;
}

interface EditingState {
  /** null 表示新建配置。 */
  profileId: string | null;
}

export function TranslationProfilesPanel({ repository, promptRepository }: TranslationProfilesPanelProps) {
  const [state, setState] = useState<TranslationProfileState>(EMPTY_PROFILE_STATE);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [values, setValues] = useState<ProfileFormValues>(() => toFormValues());
  const [issues, setIssues] = useState<readonly ProfileValidationIssue[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [testState, setTestState] = useState<ConnectionTestState>({ status: 'idle' });

  useEffect(() => {
    let active = true;
    void promptRepository.read().then((current) => {
      if (active) setPrompt(current);
    });
    const unsubscribe = promptRepository.watch((current) => setPrompt(current));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [promptRepository]);

  useEffect(() => {
    let active = true;
    void repository.read().then((next) => {
      if (!active) return;
      setState(next);
      setLoading(false);
    });
    const unsubscribe = repository.watch((next) => setState(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  const beginCreate = (): void => {
    setEditing({ profileId: null });
    setValues(toFormValues());
    setIssues([]);
    setSaveError(null);
    setStatus(null);
    setTestState({ status: 'idle' });
  };

  const beginEdit = (profileId: string): void => {
    const profile = state.profiles.find((item) => item.id === profileId);
    if (!profile) return;
    setEditing({ profileId });
    setValues(toFormValues(profile));
    setIssues([]);
    setSaveError(null);
    setStatus(null);
    setTestState({ status: 'idle' });
  };

  const closeEditor = (): void => {
    setEditing(null);
    setIssues([]);
    setSaveError(null);
    setTestState({ status: 'idle' });
  };

  const testConnection = async (): Promise<void> => {
    const result = toDraft(values);
    if (!result.ok) {
      setIssues(result.issues);
      setSaveError(null);
      setTestState({ status: 'idle' });
      return;
    }

    setIssues([]);
    setSaveError(null);
    setTestState({ status: 'running' });
    const response = await requestConnectionTest(result.draft, prompt);
    setTestState(
      response.ok
        ? { status: 'success', translation: response.translation }
        : { status: 'error', message: response.error.message },
    );
  };

  const save = async (): Promise<void> => {
    const result = toDraft(values);
    if (!result.ok) {
      setIssues(result.issues);
      setSaveError(null);
      return;
    }

    setIssues([]);
    setSaveError(null);
    setBusy(true);
    try {
      if (editing?.profileId) await repository.update(editing.profileId, result.draft);
      else await repository.create(result.draft);
      setEditing(null);
      setStatus('配置已保存。');
    } catch (error) {
      setSaveError(
        error instanceof InvalidProfileError ? error.message : '保存失败，请重试。',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (profileId: string): Promise<void> => {
    await repository.remove(profileId);
    setConfirmingDelete(null);
    if (editing?.profileId === profileId) closeEditor();
    setStatus('配置已删除。');
  };

  const makeDefault = async (profileId: string): Promise<void> => {
    await repository.setDefault(profileId);
    setStatus('已设为默认配置。');
  };

  return (
    <div className="aiwt-panel">
      <section aria-labelledby="aiwt-profiles-heading">
        <div className="aiwt-section-header">
          <h2 id="aiwt-profiles-heading">翻译服务配置</h2>
          <button type="button" className="aiwt-primary" onClick={beginCreate}>
            新建配置
          </button>
        </div>
        <p className="aiwt-hint">
          每份配置保存完整请求地址、模型和认证信息，全部只保存在本机扩展存储。划词翻译和整页翻译共用同一份配置目录。
        </p>

        {status && (
          <p className="aiwt-status" role="status">
            {status}
          </p>
        )}

        {loading && <p className="aiwt-hint">正在读取本机配置…</p>}

        {!loading && state.profiles.length === 0 && (
          <p className="aiwt-empty">
            还没有翻译服务配置。本扩展不内置 AI 模型，请先创建一份你自己的 OpenAI 兼容服务；配置完成后即可用于英文→中文的划词翻译与整页翻译。
          </p>
        )}

        {state.profiles.length > 0 && (
          <ul className="aiwt-profile-list">
            {state.profiles.map((profile) => {
              const isDefault = profile.id === state.defaultProfileId;
              const maskedKey = maskApiKey(profile.apiKey);
              return (
                <li key={profile.id} className="aiwt-profile-item">
                  <div className="aiwt-profile-summary">
                    <h3>
                      {profile.name}
                      {isDefault && <span className="aiwt-badge">默认</span>}
                    </h3>
                    <p className="aiwt-profile-meta">
                      {profile.model} · {hostOf(profile.url)}
                    </p>
                    <p className="aiwt-profile-meta">
                      {maskedKey ? `API Key：${maskedKey}` : '未设置 API Key（依赖自定义认证请求头）'}
                    </p>
                  </div>
                  <div className="aiwt-profile-actions">
                    <button type="button" onClick={() => beginEdit(profile.id)}>
                      编辑
                    </button>
                    {!isDefault && (
                      <button type="button" onClick={() => void makeDefault(profile.id)}>
                        设为默认
                      </button>
                    )}
                    <button type="button" onClick={() => setConfirmingDelete(profile.id)}>
                      删除
                    </button>
                  </div>
                  {confirmingDelete === profile.id && (
                    <div className="aiwt-confirm" role="group" aria-label={`确认删除 ${profile.name}`}>
                      <span>删除后不可恢复，确定删除这条配置吗？</span>
                      <button type="button" onClick={() => void remove(profile.id)}>
                        确认删除
                      </button>
                      <button type="button" onClick={() => setConfirmingDelete(null)}>
                        取消
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && (
        <section aria-labelledby="aiwt-profile-editor-heading">
          <h2 id="aiwt-profile-editor-heading" className="aiwt-visually-hidden">
            配置编辑
          </h2>
          <ProfileEditor
            heading={editing.profileId ? '编辑配置' : '新建配置'}
            values={values}
            issues={issues}
            saveError={saveError}
            busy={busy}
            testState={testState}
            onChange={setValues}
            onSave={() => void save()}
            onCancel={closeEditor}
            onTest={() => void testConnection()}
          />
        </section>
      )}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
