<script setup lang="ts">
import { ref, computed } from 'vue';
import { useData } from 'vitepress';

const { lang } = useData();
const copied = ref(false);
const cmd = 'npx @zwaggen/web';

async function copy() {
  try {
    await navigator.clipboard.writeText(cmd);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // Clipboard may be unavailable in insecure contexts; silently no-op.
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
  padding: 1.5rem;
  background: var(--vp-c-bg-soft);
  border-radius: 14px;
  border: 1px solid var(--vp-c-divider);
  width: 100%;
  max-width: 380px;
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
  padding: 0.75rem 0.85rem;
  background: var(--vp-c-bg);
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  font-family: var(--vp-font-family-mono);
  font-size: 0.95rem;
}

.code-wrapper code {
  flex: 1;
  background: transparent;
  color: var(--vp-c-brand-1);
  padding: 0;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.code-wrapper button {
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
