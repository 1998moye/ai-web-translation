export type SessionId = string;
export type RequestId = string;
export type ProfileId = string;
export type TranslationUnitId = string;

let sequence = 0;

/** 生成可读、稳定的标识符：前缀 + 时间 + 序号 + 随机后缀。 */
export function createId(prefix: 'ses' | 'req' | 'unit' | 'prof'): string {
  sequence += 1;
  const time = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}_${sequence.toString(36)}_${suffix}`;
}

export const createSessionId = (): SessionId => createId('ses');
export const createRequestId = (): RequestId => createId('req');
export const createUnitId = (): TranslationUnitId => createId('unit');
export const createProfileId = (): ProfileId => createId('prof');
