import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { fromJSON, toJSON, stripSecrets, extractSecrets } from '../schema/serialize';
import { collectBrokenRefs } from '../schema/rename';
import { saveSecrets, loadSecrets } from '../storage/drafts';
import type { Spec } from '../schema/types';
import {
  downloadBlob,
  pickOpen,
  pickSave,
  readFile,
  supportsFileSystemAccess,
  uploadFile,
  writeFile,
} from '../storage/file';
import { ExportMenu } from './ExportMenu';
import { IconFile, IconFolder, IconGlobe, IconSave, IconX } from './icons';
import i18n from '../i18n';

export function AppHeader() {
  const { t } = useTranslation();
  const { spec, setSpec, fileHandle, dirty, replaceSpec, newSpec, markSaved, discardDraft } =
    useSpecStore();

  const currentLang = i18n.language;

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(spec.info.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingName) setDraftName(spec.info.name);
  }, [spec.info.name, editingName]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  function commitName() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== spec.info.name) {
      void setSpec({ ...spec, info: { ...spec.info, name: trimmed } });
    } else {
      setDraftName(spec.info.name);
    }
    setEditingName(false);
  }

  function toggleLang() {
    const next = currentLang === 'en' ? 'zh-TW' : 'en';
    void i18n.changeLanguage(next);
    localStorage.setItem('zwaggen:lang', next);
  }

  async function openSpec() {
    async function hydrateSecrets(parsed: Spec): Promise<Spec> {
      const store = await loadSecrets();
      const envs: typeof parsed.environments = {};
      for (const [name, env] of Object.entries(parsed.environments)) {
        const known = store[name] ?? {};
        envs[name] = {
          variables: env.variables.map((v) =>
            v.secret && !v.value && known[v.name] ? { ...v, value: known[v.name]! } : v,
          ),
        };
      }
      return { ...parsed, environments: envs };
    }
    if (supportsFileSystemAccess()) {
      const h = await pickOpen();
      if (!h) return;
      const { text } = await readFile(h);
      await replaceSpec(await hydrateSecrets(fromJSON(JSON.parse(text))), h);
    } else {
      const up = await uploadFile();
      if (!up) return;
      await replaceSpec(await hydrateSecrets(fromJSON(JSON.parse(up.text))), null);
    }
  }

  async function saveSpec() {
    const broken = collectBrokenRefs(spec);
    if (broken.length > 0) {
      alert(`Cannot save: ${broken.length} broken type reference(s). Fix them in the Types panel.`);
      return;
    }
    const onDisk = stripSecrets(spec);
    const existing = await loadSecrets();
    await saveSecrets({ ...existing, ...extractSecrets(spec) });
    const text = toJSON(onDisk);
    if (fileHandle) {
      await writeFile(text, fileHandle);
      await markSaved(fileHandle);
      return;
    }
    if (supportsFileSystemAccess()) {
      const h = await pickSave();
      if (!h) return;
      await writeFile(text, h);
      await markSaved(h);
    } else {
      downloadBlob(new Blob([text], { type: 'application/json' }), 'spec.zwaggen.json');
      await markSaved(null);
    }
  }

  async function onDiscard() {
    if (!confirm('Discard unsaved changes and reload from the source file?')) return;
    const { reloadedFromFile } = await discardDraft();
    if (!reloadedFromFile) {
      alert('No source file attached — draft cleared and spec reset. Use "Open" to load one.');
    }
  }

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mr-auto flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m8 3 4 8 5-5 5 15H2Z" />
          </svg>
        </div>
        <h1 className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight">Zwaggen</span>
          <span className="text-slate-300">/</span>
          {editingName ? (
            <input
              ref={nameInputRef}
              aria-label={t('specName')}
              className="min-w-[100px] max-w-[320px] border-b border-brand-400 bg-transparent px-0.5 text-sm font-medium text-slate-700 outline-none"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') { setDraftName(spec.info.name); setEditingName(false); }
              }}
            />
          ) : (
            <button
              type="button"
              className="rounded px-0.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-brand-600"
              title={t('clickToEdit')}
              onClick={() => setEditingName(true)}
            >
              {spec.info.name}
            </button>
          )}
          {dirty && (
            <span
              aria-label={t('unsavedChanges')}
              className="chip bg-amber-100 text-amber-800"
            >
              {t('unsaved')}
            </span>
          )}
        </h1>
      </div>
      <button className="btn" onClick={() => void newSpec()}>
        <IconFile />
        {t('new')}
      </button>
      <button className="btn" onClick={() => void openSpec()}>
        <IconFolder />
        {t('open')}
      </button>
      {dirty && (
        <button className="btn" onClick={() => void onDiscard()}>
          <IconX />
          {t('discardDraft')}
        </button>
      )}
      <button className="btn-primary" onClick={() => void saveSpec()}>
        <IconSave />
        {t('save')}
      </button>
      <ExportMenu />
      <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
      <button
        className="btn-icon gap-1 px-2 text-xs font-medium text-slate-500 hover:text-slate-700"
        title={currentLang === 'en' ? '切換至中文' : 'Switch to English'}
        aria-label={currentLang === 'en' ? '切換至中文' : 'Switch to English'}
        onClick={toggleLang}
      >
        <IconGlobe width={14} height={14} />
        {currentLang === 'en' ? '中文' : 'EN'}
      </button>
    </header>
  );
}
