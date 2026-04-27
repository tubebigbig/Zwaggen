import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import {
  fromJSON,
  toJSON,
  stripSecrets,
  extractSecrets,
  collectBrokenRefs,
  type Spec,
} from '@zwaggen/core';
import { fromOpenApi } from '../importers/openapi';
import { saveSecrets, loadSecrets } from '../storage/drafts';
import { downloadBlob, uploadFile } from '../storage/file';
import { getStorage, type FileRef, type OpenedFile } from '../storage/spec-storage';
import { ExportMenu } from './ExportMenu';
import { BatchRunPanel } from './BatchRunPanel';
import { DiffPanel } from './DiffPanel';
import { LoadErrorModal } from './LoadErrorModal';
import { IconFile, IconFolder, IconGlobe, IconPanelRight, IconPlay, IconSave, IconUpload, IconX } from './icons';
import { OverflowMenu } from './OverflowMenu';
import i18n from '../i18n';
import { IS_PLAYGROUND } from '../config';
import { setUiPref, useUiPrefs } from '../state/uiPrefs';

export function AppHeader() {
  const { t } = useTranslation();
  const { spec, setSpec, fileHandle, dirty, replaceSpec, newSpec, markSaved, discardDraft } =
    useSpecStore();
  const { livePreviewOpen } = useUiPrefs();

  const currentLang = i18n.language;

  const [importWarnings, setImportWarnings] = useState<string[] | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [diffBase, setDiffBase] = useState<Spec | null>(null);
  const [loadError, setLoadError] = useState<{ filename: string; message: string } | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(spec.info.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingName) setDraftName(spec.info.name);
  }, [spec.info.name, editingName]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  // Subscribe to native menu actions emitted by the desktop shell. Browser
  // builds (no `window.zwaggen`) skip this entirely. Returning the unsubscribe
  // is critical — React StrictMode in dev runs effects twice and would
  // otherwise accumulate menu handlers, firing Open/Save N times per click.
  useEffect(() => {
    const bridge = (window as { zwaggen?: { onMenuAction?: (cb: (action: string) => void) => () => void } }).zwaggen;
    if (!bridge?.onMenuAction) return;
    const unsubscribe = bridge.onMenuAction((action) => {
      if (action === 'open') void openSpec();
      else if (action === 'save') void saveSpec();
      else if (action === 'save-as') void saveSpec({ forceDialog: true });
    });
    return () => unsubscribe();
    // openSpec / saveSpec are stable closures over current state via store hooks;
    // re-subscribing on every render would attach duplicate handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    let filename = '';
    try {
      let text: string;
      let handle: FileRef | null;

      if (getStorage().supportsNativePicker()) {
        const opened: OpenedFile | null = await getStorage().pickOpen();
        if (!opened) return;
        filename = opened.name;
        text = opened.text;
        handle = opened.handle;
      } else {
        const up = await uploadFile();
        if (!up) return;
        filename = up.name;
        text = up.text;
        handle = null;
      }

      const parsed = fromJSON(JSON.parse(text));
      await replaceSpec(await hydrateSecrets(parsed), handle);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setLoadError({
        filename: filename || '—',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function importOpenApi() {
    let text: string | null = null;
    if (getStorage().supportsNativePicker()) {
      const opened = await getStorage().pickOpen();
      if (!opened) return;
      text = opened.text;
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
    if (getStorage().supportsNativePicker()) {
      const opened = await getStorage().pickOpen();
      if (!opened) return;
      text = opened.text;
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

  async function saveSpec(opts?: { forceDialog?: boolean }) {
    const broken = collectBrokenRefs(spec);
    if (broken.length > 0) {
      alert(`Cannot save: ${broken.length} broken type reference(s). Fix them in the Types panel.`);
      return;
    }
    const onDisk = stripSecrets(spec);
    const existing = await loadSecrets();
    await saveSecrets({ ...existing, ...extractSecrets(spec) });
    const text = toJSON(onDisk);
    if (fileHandle && !opts?.forceDialog) {
      await getStorage().writeFile(fileHandle, text);
      await markSaved(fileHandle);
      return;
    }
    if (getStorage().supportsNativePicker()) {
      const h = await getStorage().pickSave();
      if (!h) return;
      await getStorage().writeFile(h, text);
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
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m8 3 4 8 5-5 5 15H2Z" />
            </svg>
          </div>
          <h1 className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-base font-semibold tracking-tight">Zwaggen</span>
            {IS_PLAYGROUND && (
              <a
                href="https://docs.zwaggen.com"
                className="chip shrink-0 bg-brand-50 text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100"
                title="Hosted playground — no proxy, data stays in your browser. Click for docs."
              >
                Playground
              </a>
            )}
            <span className="shrink-0 text-slate-300">/</span>
            {editingName ? (
              <input
                ref={nameInputRef}
                aria-label={t('specName')}
                className="min-w-0 max-w-[320px] border-b border-brand-400 bg-transparent px-0.5 text-sm font-medium text-slate-700 outline-none"
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
                className="rounded px-0.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-brand-600 truncate max-w-[200px]"
                title={t('clickToEdit')}
                onClick={() => setEditingName(true)}
              >
                {spec.info.name}
              </button>
            )}
            {dirty && (
              <span
                aria-label={t('unsavedChanges')}
                className="chip shrink-0 bg-amber-100 text-amber-800"
              >
                {t('unsaved')}
              </span>
            )}
          </h1>
        </div>
        {/* Inline on xl+, collapsed into overflow menu below 1280px */}
        <button className="btn hidden shrink-0 xl:inline-flex" onClick={() => void newSpec()}>
          <IconFile />
          {t('new')}
        </button>
        <button className="btn hidden shrink-0 xl:inline-flex" onClick={() => void openSpec()}>
          <IconFolder />
          {t('open')}
        </button>
        <button className="btn hidden shrink-0 xl:inline-flex" onClick={() => void importOpenApi()}>
          <IconUpload />
          {t('importOpenApi')}
        </button>
        <button className="btn hidden shrink-0 xl:inline-flex" onClick={() => void compareSpec()}>
          {t('compare')}
        </button>
        {dirty && (
          <button className="btn hidden shrink-0 xl:inline-flex" onClick={() => void onDiscard()}>
            <IconX />
            {t('discardDraft')}
          </button>
        )}
        <button className="btn-primary shrink-0" onClick={() => void saveSpec()}>
          <IconSave />
          {t('save')}
        </button>
        <div className="shrink-0">
          <ExportMenu />
        </div>
        <button
          type="button"
          className={`btn-icon shrink-0 ${livePreviewOpen ? 'text-brand-600 bg-brand-50' : ''}`}
          aria-label={t('livePreview')}
          aria-pressed={livePreviewOpen}
          title={t('livePreview')}
          onClick={() => setUiPref('livePreviewOpen', !livePreviewOpen)}
        >
          <IconPanelRight />
        </button>
        <button className="btn shrink-0" onClick={() => setBatchOpen(true)}>
          <IconPlay />
          {t('runAll')}
        </button>
        <div className="shrink-0 xl:hidden">
          <OverflowMenu>
            <button role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void newSpec()}>
              <IconFile />
              {t('new')}
            </button>
            <button role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void openSpec()}>
              <IconFolder />
              {t('open')}
            </button>
            <button role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void importOpenApi()}>
              <IconUpload />
              {t('importOpenApi')}
            </button>
            <button role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void compareSpec()}>
              {t('compare')}
            </button>
            {dirty && (
              <button role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void onDiscard()}>
                <IconX />
                {t('discardDraft')}
              </button>
            )}
          </OverflowMenu>
        </div>
        <button
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
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
      {loadError && (
        <LoadErrorModal
          filename={loadError.filename}
          message={loadError.message}
          onClose={() => setLoadError(null)}
        />
      )}
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
