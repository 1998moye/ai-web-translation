import type { TranslationProfileCatalog, TranslationProfileSummary } from '../translation-contract/profile-catalog';
import type { TranslationProfileState, TranslationProfileRepository } from './profile-store';

/**
 * 只读配置目录的存储 Adapter：内容脚本只能拿到 ID、名称和默认状态，
 * 完整地址、API Key 和自定义请求头留在设置页与后台。
 */
export class StoredTranslationProfileCatalog implements TranslationProfileCatalog {
  constructor(private readonly repository: TranslationProfileRepository) {}

  async listProfiles(): Promise<readonly TranslationProfileSummary[]> {
    const state = await this.repository.read();
    return state.profiles.map((profile) => toSummary(profile.id, profile.name, profile.id === state.defaultProfileId));
  }

  async getDefaultProfile(): Promise<TranslationProfileSummary | null> {
    const state = await this.repository.read();
    const profile = state.profiles.find((item) => item.id === state.defaultProfileId);
    return profile ? toSummary(profile.id, profile.name, true) : null;
  }
}

/** 摘要只包含这三个字段；任何额外字段都会把配置细节泄露到页面。 */
export function toSummary(
  id: TranslationProfileSummary['id'],
  name: string,
  isDefault: boolean,
): TranslationProfileSummary {
  return { id, name, isDefault };
}

export type { TranslationProfileState };
