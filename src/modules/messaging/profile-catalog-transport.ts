import { browser } from 'wxt/browser';
import type {
  TranslationProfileCatalog,
  TranslationProfileSummary,
} from '../translation-contract/profile-catalog';


export const PROFILE_CATALOG_REQUEST_TYPE = 'aiwt:profile-catalog';

export interface ProfileCatalogRequest {
  type: typeof PROFILE_CATALOG_REQUEST_TYPE;
}

export interface ProfileCatalogResponse {
  ok: true;
  profiles: TranslationProfileSummary[];
}

export function createProfileCatalogRequest(): ProfileCatalogRequest {
  return { type: PROFILE_CATALOG_REQUEST_TYPE };
}

export function isProfileCatalogRequest(message: unknown): message is ProfileCatalogRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === PROFILE_CATALOG_REQUEST_TYPE
  );
}

export function isProfileCatalogResponse(value: unknown): value is ProfileCatalogResponse {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.ok === true && Array.isArray(record.profiles);
}

/** 后台侧：只返回配置摘要，完整配置与密钥不离开后台。 */
export async function createProfileCatalogResponse(
  catalog: TranslationProfileCatalog,
): Promise<ProfileCatalogResponse> {
  return { ok: true, profiles: [...(await catalog.listProfiles())] };
}

/**
 * 内容脚本侧的 Translation Profile Catalog Adapter。
 * 只拿到 ID、名称和默认状态；配置被删除或不可用时返回空结果。
 */
export class MessagingProfileCatalog implements TranslationProfileCatalog {
  async listProfiles(): Promise<readonly TranslationProfileSummary[]> {
    return (await this.readCatalog()).profiles;
  }

  async getDefaultProfile(): Promise<TranslationProfileSummary | null> {
    return (await this.readCatalog()).profiles.find((profile) => profile.isDefault) ?? null;
  }

  private async readCatalog(): Promise<ProfileCatalogResponse> {
    try {
      const response = await browser.runtime.sendMessage(createProfileCatalogRequest());
      if (isProfileCatalogResponse(response)) return response;
    } catch {
      // 后台尚未就绪。
    }
    return { ok: true, profiles: [] };
  }
}
