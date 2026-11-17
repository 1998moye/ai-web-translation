import { defineConfig } from 'wxt';

/**
 * 开发演示构建（AIWT_FAKE_ENGINE=1）使用 fake Translation Engine，
 * 输出到独立目录，生产装配不会包含 fake Adapter。
 */
const useFakeEngine = process.env.AIWT_FAKE_ENGINE === '1';

export default defineConfig({
  srcDir: 'src',
  outDir: useFakeEngine ? '.output-fake' : '.output',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AI 网页翻译',
    description: '使用你自己配置的 AI 翻译服务阅读英文网页：划词翻译与整页双语翻译。',
    permissions: ['storage'],
    host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_title: '打开 AI 网页翻译设置' },
  },
  vite: () => ({
    define: {
      __AIWT_FAKE_ENGINE__: JSON.stringify(useFakeEngine),
    },
  }),
});
