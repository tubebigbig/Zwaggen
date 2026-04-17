import 'fake-indexeddb/auto';
import { beforeEach, expect, test } from 'vitest';
import { clearDraft, loadDraft, loadSecrets, saveDraft, saveSecrets } from '../../src/storage/drafts';
import { emptySpec } from '../../src/schema/defaults';

beforeEach(async () => { await clearDraft(); });

test('round-trips a draft spec', async () => {
  const s = emptySpec('Hello');
  await saveDraft(s);
  expect(await loadDraft()).toEqual(s);
});

test('clearDraft removes the draft', async () => {
  await saveDraft(emptySpec());
  await clearDraft();
  expect(await loadDraft()).toBeNull();
});

test('secrets are stored separately from the spec', async () => {
  await saveSecrets({ default: { TOKEN: 'abc' } });
  expect(await loadSecrets()).toEqual({ default: { TOKEN: 'abc' } });
});
