import { del, get, set } from 'idb-keyval';
import type { Spec } from '../schema/types';

const DRAFT_KEY = 'gen-spec:draft';
const SECRETS_KEY = 'gen-spec:secrets';

export type SecretStore = Record<string /* envName */, Record<string /* varName */, string>>;

export async function saveDraft(spec: Spec): Promise<void> {
  await set(DRAFT_KEY, spec);
}
export async function loadDraft(): Promise<Spec | null> {
  const s = await get<Spec>(DRAFT_KEY);
  return s ?? null;
}
export async function clearDraft(): Promise<void> {
  await del(DRAFT_KEY);
}
export async function saveSecrets(secrets: SecretStore): Promise<void> {
  await set(SECRETS_KEY, secrets);
}
export async function loadSecrets(): Promise<SecretStore> {
  return (await get<SecretStore>(SECRETS_KEY)) ?? {};
}
