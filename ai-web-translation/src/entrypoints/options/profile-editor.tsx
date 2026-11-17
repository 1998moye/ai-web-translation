import { useState } from 'react';
import type { ProfileFormValues } from '@/modules/translation-profile/profile-form';
import type { ProfileField, ProfileValidationIssue } from '@/modules/translation-profile/profile-validation';

const FIELD_LABELS: Record<ProfileField, string> = {
  name: '配置名称',
  url: '请求地址',
  model: '模型名',
  apiKey: 'API Key',
  headers: '自定义请求头',
  extraParams: '额外请求参数',
  concurrency: '并发数',
  timeoutMs: '请求超时',
  retryCount: '自动重试次数',
};

export interface ProfileEditorProps {
  heading: string;
  values: ProfileFormValues;
  issues: readonly ProfileValidationIssue[];
  saveError: string | null;
  busy: boolean;
  testState: ConnectionTestState;
  onChange(values: ProfileFormValues): void;
  onSave(): void;
  onCancel(): void;
  onTest(): void;
}

/** 测试连接的公开状态：请求中与请求完成可区分，失败只带脱敏消息。 */
export type ConnectionTestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'success'; translation: string }
  | { status: 'error'; message: string };

export function ProfileEditor({
  heading,
  values,
  issues,
  saveError,
  busy,
  testState,
  onChange,
  onSave,
  onCancel,
  onTest,
}: ProfileEditorProps) {
  const [revealKey, setRevealKey] = useState(false);

  const update = <Key extends keyof ProfileFormValues>(key: Key, value: ProfileFormValues[Key]): void => {
    onChange({ ...values, [key]: value });
  };
  const errorOf = (field: ProfileField): string | undefined =>
    issues.find((issue) => issue.field === field)?.message;
  const invalid = (field: ProfileField): true | undefined => (errorOf(field) ? true : undefined);

  return (
    <form
      className="aiwt-profile-editor"
      aria-label={heading}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <h3>{heading}</h3>

      {(issues.length > 0 || saveError) && (
        <ul className="aiwt-issues" role="alert">
          {saveError && <li>{saveError}</li>}
          {issues.map((issue) => (
            <li key={`${issue.field}-${issue.message}`}>
              {FIELD_LABELS[issue.field]}：{issue.message}
            </li>
          ))}
        </ul>
      )}

      <div className="aiwt-field">
        <label htmlFor="aiwt-profile-name">配置名称</label>
        <input
          id="aiwt-profile-name"
          value={values.name}
          aria-invalid={invalid('name')}
          placeholder="例如：主力翻译服务"
          onChange={(event) => update('name', event.target.value)}
        />
        {errorOf('name') && <p className="aiwt-field-error">{errorOf('name')}</p>}
      </div>

      <div className="aiwt-field">
        <label htmlFor="aiwt-profile-url">请求地址</label>
        <input
          id="aiwt-profile-url"
          value={values.url}
          aria-invalid={invalid('url')}
          placeholder="https://api.example.com/v1/chat/completions"
          onChange={(event) => update('url', event.target.value)}
        />
        <p className="aiwt-field-hint">填写完整的 Chat Completions 地址。远程只允许 HTTPS，localhost 与 127.0.0.1 可用 HTTP。</p>
        {errorOf('url') && <p className="aiwt-field-error">{errorOf('url')}</p>}
      </div>

      <div className="aiwt-field">
        <label htmlFor="aiwt-profile-model">模型名</label>
        <input
          id="aiwt-profile-model"
          value={values.model}
          aria-invalid={invalid('model')}
          placeholder="gpt-4o-mini"
          onChange={(event) => update('model', event.target.value)}
        />
        {errorOf('model') && <p className="aiwt-field-error">{errorOf('model')}</p>}
      </div>

      <div className="aiwt-field">
        <label htmlFor="aiwt-profile-api-key">API Key</label>
        <div className="aiwt-field-row">
          <input
            id="aiwt-profile-api-key"
            type={revealKey ? 'text' : 'password'}
            value={values.apiKey}
            aria-invalid={invalid('apiKey')}
            autoComplete="off"
            spellCheck={false}
            placeholder="留空表示不使用 Bearer 认证"
            onChange={(event) => update('apiKey', event.target.value)}
          />
          <button type="button" onClick={() => setRevealKey((current) => !current)}>
            {revealKey ? '隐藏' : '显示'}
          </button>
        </div>
        <p className="aiwt-field-hint">
          只保存在本机扩展存储，页面脚本读不到。使用其他认证方式时留空，并在下方填写认证请求头。
        </p>
        {errorOf('apiKey') && <p className="aiwt-field-error">{errorOf('apiKey')}</p>}
      </div>

      <fieldset className="aiwt-advanced">
        <legend>高级设置</legend>

        <div className="aiwt-field">
          <label htmlFor="aiwt-profile-headers">自定义请求头</label>
          <textarea
            id="aiwt-profile-headers"
            rows={3}
            value={values.headersText}
            aria-invalid={invalid('headers')}
            spellCheck={false}
            placeholder={'Authorization: Bearer your-token\nX-Tenant: team-a'}
            onChange={(event) => update('headersText', event.target.value)}
          />
          <p className="aiwt-field-hint">每行一条「名称: 值」。浏览器禁止设置的请求头会在保存时提示。</p>
          {errorOf('headers') && <p className="aiwt-field-error">{errorOf('headers')}</p>}
        </div>

        <div className="aiwt-field">
          <label htmlFor="aiwt-profile-extra-params">额外请求参数（JSON 对象）</label>
          <textarea
            id="aiwt-profile-extra-params"
            rows={5}
            value={values.extraParamsText}
            aria-invalid={invalid('extraParams')}
            spellCheck={false}
            onChange={(event) => update('extraParamsText', event.target.value)}
          />
          <p className="aiwt-field-hint">
            默认显式关闭思考。model、messages、stream 由扩展管理，不能在这里覆盖。
          </p>
          {errorOf('extraParams') && <p className="aiwt-field-error">{errorOf('extraParams')}</p>}
        </div>

        <div className="aiwt-field-grid">
          <div className="aiwt-field">
            <label htmlFor="aiwt-profile-concurrency">并发数</label>
            <input
              id="aiwt-profile-concurrency"
              type="number"
              min={1}
              max={16}
              value={values.concurrency}
              aria-invalid={invalid('concurrency')}
              onChange={(event) => update('concurrency', event.target.value)}
            />
            {errorOf('concurrency') && <p className="aiwt-field-error">{errorOf('concurrency')}</p>}
          </div>

          <div className="aiwt-field">
            <label htmlFor="aiwt-profile-timeout">请求超时（秒）</label>
            <input
              id="aiwt-profile-timeout"
              type="number"
              min={1}
              max={600}
              value={values.timeoutSeconds}
              aria-invalid={invalid('timeoutMs')}
              onChange={(event) => update('timeoutSeconds', event.target.value)}
            />
            {errorOf('timeoutMs') && <p className="aiwt-field-error">{errorOf('timeoutMs')}</p>}
          </div>

          <div className="aiwt-field">
            <label htmlFor="aiwt-profile-retries">自动重试次数</label>
            <input
              id="aiwt-profile-retries"
              type="number"
              min={0}
              max={5}
              value={values.retryCount}
              aria-invalid={invalid('retryCount')}
              onChange={(event) => update('retryCount', event.target.value)}
            />
            {errorOf('retryCount') && <p className="aiwt-field-error">{errorOf('retryCount')}</p>}
          </div>
        </div>
        <p className="aiwt-field-hint">并发、超时和重试是插件任务设置，不会写入翻译请求体。</p>
      </fieldset>

      <div className="aiwt-form-actions">
        <button type="submit" className="aiwt-primary" disabled={busy}>
          保存
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button type="button" onClick={onTest} disabled={busy || testState.status === 'running'}>
          {testState.status === 'running' ? '测试中…' : '测试连接'}
        </button>
      </div>

      <p className="aiwt-field-hint">
        测试连接用固定英文短句，基于上方当前配置与已保存的提示词发起一次真实请求，不读取译文缓存。
      </p>

      {testState.status === 'success' && (
        <p className="aiwt-test-result" role="status">
          测试成功，返回译文：{testState.translation}
        </p>
      )}
      {testState.status === 'error' && (
        <p className="aiwt-test-error" role="alert">
          测试失败：{testState.message}
        </p>
      )}
    </form>
  );
}
