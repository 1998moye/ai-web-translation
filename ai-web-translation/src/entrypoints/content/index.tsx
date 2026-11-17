import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { createRoot } from 'react-dom/client';
import { createContentAssembly } from '@/modules/assembly/content-assembly';
import { ContentShell } from '@/modules/content-shell/content-shell';
import '@/modules/floating-button/floating-button.css';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const assembly = createContentAssembly();

    const ui = await createShadowRootUi(ctx, {
      name: 'aiwt-ui',
      position: 'overlay',
      zIndex: 2147483000,
      anchor: 'body',
      onMount: (container) => {
        const root = createRoot(container);
        // 划词翻译浮层由「配置与划词翻译」实现在这里装配，共用同一个 Shadow DOM。
        root.render(<ContentShell controller={assembly.controller} positionStore={assembly.positionStore} />);
        return root;
      },
      onRemove: (root) => root?.unmount(),
    });

    // 标记宿主节点，页面扫描与动态监听会忽略插件自身 UI。
    ui.shadowHost.setAttribute('data-aiwt', 'ui');
    ui.mount();

    await assembly.controller.mount();

    ctx.onInvalidated(() => {
      assembly.dispose();
      ui.remove();
    });
  },
});
