import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { fromJSON, toJSON, stripSecrets, extractSecrets } from '../schema/serialize';
import { fromOpenApi } from '../importers/openapi';
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
import { BatchRunPanel } from './BatchRunPanel';
import { DiffPanel } from './DiffPanel';
import { IconFile, IconFolder, IconGlobe, IconPlay, IconSave, IconUpload, IconX } from './icons';
import i18n from '../i18n';
import { IS_PLAYGROUND } from '../config';

export function AppHeader() {
  const { t } = useTranslation();
  const { spec, setSpec, fileHandle, dirty, replaceSpec, newSpec, markSaved, discardDraft } =
    useSpecStore();

  const currentLang = i18n.language;

  const [importWarnings, setImportWarnings] = useState<string[] | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [diffBase, setDiffBase] = useState<Spec | null>(null);

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

  async function importOpenApi() {
    let text: string | null = null;
    if (supportsFileSystemAccess()) {
      const h = await pickOpen();
      if (!h) return;
      const r = await readFile(h);
      text = r.text;
    } else {
      const up = await uploadFile();
      if (!up) return;
      text = up.text;
    }
    let doc: unknown;
    try { doc = JSON.parse(text); }
    catch {
      alert(t('importBadJson'));
      return;
    }
    const { spec, warnings } = fromOpenApi(doc);
    setImportWarnings(warnings);
    await replaceSpec(spec, null);
  }

  async function compareSpec() {
    let text: string | null = null;
    if (supportsFileSystemAccess()) {
      const h = await pickOpen();
      if (!h) return;
      const r = await readFile(h);
      text = r.text;
    } else {
      const up = await uploadFile();
      if (!up) return;
      text = up.text;
    }
    let other: Spec;
    try {
      other = fromJSON(JSON.parse(text));
    } catch {
      alert(t('diffBadJson'));
      return;
    }
    setDiffBase(other);
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
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <div className="mr-auto flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m8 3 4 8 5-5 5 15H2Z" />
            </svg>
          </div>
          <h1 className="flex items-baseline gap-2">
            <span className="text-base font-semibold tracking-tight">Zwaggen</span>
            {IS_PLAYGROUND && (
              <a
                href="https://docs.zwaggen.com"
                className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100"
                title="Hosted playground — no proxy, data stays in your browser. Click for docs."
              >
                Playground
              </a>
            )}
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
        <button className="btn" onClick={() => void importOpenApi()}>
          <IconUpload />
          {t('importOpenApi')}
        </button>
        <button className="btn" onClick={() => void compareSpec()}>
          {t('compare')}
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
        <button className="btn" onClick={() => setBatchOpen(true)}>
          <IconPlay />
          {t('runAll')}
        </button>
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
      </div>
      {batchOpen && <BatchRunPanel spec={spec} onClose={() => setBatchOpen(false)} />}
      {diffBase && <DiffPanel base={diffBase} current={spec} onClose={() => setDiffBase(null)} />}
      {importWarnings && importWarnings.length > 0 && (
        <div role="alert" className="mx-4 mb-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold">
                {t('importWarnings', { count: importWarnings.length })}
              </div>
              <ul className="mt-1 list-disc pl-4">
                {importWarnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              {importWarnings.length > 5 && (
                <div className="mt-1 text-amber-700">+{importWarnings.length - 5} more</div>
              )}
            </div>
            <button onClick={() => setImportWarnings(null)} className="btn-icon" aria-label={t('dismiss')}>
              <IconX />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
