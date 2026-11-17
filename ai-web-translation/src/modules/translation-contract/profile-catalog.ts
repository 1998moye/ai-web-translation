import type { ProfileId } from '@/shared/ids';

/** 内容脚本能看到的配置摘要：不含 API Key、敏感请求头或完整配置。 */
export interface TranslationProfileSummary {
  id: ProfileId;
  name: string;
  isDefault: boolean;
}

/** 只读的翻译服务配置目录，页面 UI 只能读取摘要与默认配置。 */
export interface TranslationProfileCatalog {
  listProfiles(): Promise<readonly TranslationProfileSummary[]>;
  getDefaultProfile(): Promise<TranslationProfileSummary | null>;
}
