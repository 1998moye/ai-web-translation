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
    name: 'AI 网页翻译 · 英文转中文',
    description: '自带 AI 服务的英文网页翻译：整页双语与划词翻译，只翻英文→中文，不内置模型或密钥。',
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    permissions: ['storage'],
    host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: '打开 AI 网页翻译设置',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
    },
  },
  vite: () => ({
    define: {
      __AIWT_FAKE_ENGINE__: JSON.stringify(useFakeEngine),
    },
  }),
});
