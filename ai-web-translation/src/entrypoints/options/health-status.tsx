import { useEffect, useState } from 'react';
import { pingBackground } from '@/modules/messaging/ping-background';

type HealthState =
  | { kind: 'checking' }
  | { kind: 'ok'; version: string; fakeEngine: boolean }
  | { kind: 'error' };

export function HealthStatus() {
  const [state, setState] = useState<HealthState>({ kind: 'checking' });

  useEffect(() => {
    let active = true;
    void pingBackground()
      .then((response) => {
        if (!active) return;
        setState({ kind: 'ok', version: response.version, fakeEngine: response.fakeEngine });
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);

  const text =
    state.kind === 'checking'
      ? '正在检查扩展后台…'
      : state.kind === 'ok'
        ? `扩展后台已连接（v${state.version}${state.fakeEngine ? '，开发演示构建' : ''}）`
        : '扩展后台未连接';

  return (
    <p className="aiwt-health" data-aiwt-health={state.kind}>
      {text}
    </p>
  );
}
