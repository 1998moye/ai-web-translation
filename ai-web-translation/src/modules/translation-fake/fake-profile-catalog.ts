import type { ProfileId } from '@/shared/ids';
import type { TranslationProfileCatalog, TranslationProfileSummary } from '../translation-contract/profile-catalog';

export const FAKE_PROFILES: readonly TranslationProfileSummary[] = [
  { id: 'fake-default', name: '模拟翻译服务（默认）', isDefault: true },
  { id: 'fake-alternate', name: '模拟翻译服务（备选）', isDefault: false },
];

export interface MutableFakeProfileCatalog extends TranslationProfileCatalog {
  setProfiles(profiles: readonly TranslationProfileSummary[]): void;
  setDefaultProfile(id: ProfileId | null): void;
}

/** 只读配置目录的测试 Adapter：可以模拟默认配置变化。 */
export function createFakeProfileCatalog(
  initialProfiles: readonly TranslationProfileSummary[] = FAKE_PROFILES,
): MutableFakeProfileCatalog {
  let profiles = initialProfiles.map((profile) => ({ ...profile }));

  return {
    async listProfiles() {
      return profiles.map((profile) => ({ ...profile }));
    },
    async getDefaultProfile() {
      const found = profiles.find((profile) => profile.isDefault);
      return found ? { ...found } : null;
    },
    setProfiles(next) {
      profiles = next.map((profile) => ({ ...profile }));
    },
    setDefaultProfile(id) {
      profiles = profiles.map((profile) => ({ ...profile, isDefault: profile.id === id }));
    },
  };
}
