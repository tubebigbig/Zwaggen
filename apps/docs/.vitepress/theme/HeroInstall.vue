<script setup lang="ts">
import { ref, computed } from 'vue';
import { useData } from 'vitepress';

const { lang } = useData();
const copied = ref(false);
const cmd = 'npx @zwaggen/web';

async function copy() {
  let ok = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(cmd);
      ok = true;
    }
  } catch {
    // fall through to the textarea fallback
  }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = cmd;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {
      // ignore; UI will just flash "Copy" unchanged
    }
  }
  if (ok) {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  }
}

const t = computed(() => {
  const isZh = lang.value.startsWith('zh');
  return {
    heading: isZh ? '立即安裝' : 'Run it now',
    copy: isZh ? '複製' : 'Copy',
    copied: isZh ? '已複製' : 'Copied!',
    hint: isZh ? '需要 Node 20 或更新版本' : 'Requires Node 20+',
  };
});
</script>

<template>
  <div class="hero-install">
    <div class="label">{{ t.heading }}</div>
    <div class="code-wrapper">
      <code>{{ cmd }}</code>
      <button
        type="button"
        :aria-label="t.copy"
        :title="t.copy"
        @click="copy"
      >
        {{ copied ? t.copied : t.copy }}
      </button>
    </div>
    <div class="hint">{{ t.hint }}</div>
  </div>
</template>

<style scoped>
.hero-install {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1.1rem 1.4rem;
  background: var(--vp-c-bg-soft);
  border-radius: 14px;
  border: 1px solid var(--vp-c-divider);
  width: 100%;
  max-width: 460px;
  margin: 28px auto 0;
  box-sizing: border-box;
}

/*
 * On desktop, VitePress's hero sets .VPHero.has-image .actions to
 * flex-start — without an image the default centres. The install card
 * sits below the actions; it's already margin: 0 auto, so it centres
 * regardless. No layout override needed on the VitePress side.
 */

@media (max-width: 640px) {
  .hero-install {
    max-width: 100%;
    padding: 1rem 1.1rem;
    margin-top: 20px;
  }
}

.label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.code-wrapper {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  background: var(--vp-c-bg);
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  font-family: var(--vp-font-family-mono);
  font-size: 0.9rem;
  min-width: 0;
}

.code-wrapper code {
  flex: 1 1 auto;
  min-width: 0;
  background: transparent;
  color: var(--vp-c-brand-1);
  padding: 0;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 400px) {
  .code-wrapper {
    font-size: 0.8rem;
    padding: 0.55rem 0.6rem;
  }
}

.code-wrapper button {
  flex-shrink: 0;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-bg);
  border: 0;
  padding: 0.35rem 0.85rem;
  border-radius: 7px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  letter-spacing: 0.02em;
}

.code-wrapper button:hover {
  background: var(--vp-c-brand-2);
}

.hint {
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
}
</style>
