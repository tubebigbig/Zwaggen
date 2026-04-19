<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useData } from 'vitepress';

const needRefresh = ref(false);
const updateSW = ref<(reload?: boolean) => Promise<void>>(async () => {});

const { lang } = useData();

const t = computed(() => {
  const isZh = lang.value.startsWith('zh');
  return {
    message: isZh ? '有新版文件可用。' : 'New docs available.',
    refresh: isZh ? '重新整理' : 'Refresh',
    dismiss: isZh ? '關閉' : 'Dismiss',
  };
});

onMounted(async () => {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  const { registerSW } = await import('virtual:pwa-register');
  updateSW.value = registerSW({
    onNeedRefresh() {
      needRefresh.value = true;
    },
    onOfflineReady() {
      // no-op: offline readiness is silent by design
    },
  });
});

async function applyUpdate() {
  await updateSW.value(true);
}

function dismiss() {
  needRefresh.value = false;
}
</script>

<template>
  <Transition name="pwa-toast">
    <div v-if="needRefresh" class="pwa-toast" role="status" aria-live="polite">
      <span class="pwa-toast__msg">{{ t.message }}</span>
      <button class="pwa-toast__btn pwa-toast__btn--primary" @click="applyUpdate">
        {{ t.refresh }}
      </button>
      <button class="pwa-toast__btn" :aria-label="t.dismiss" @click="dismiss">×</button>
    </div>
  </Transition>
</template>

<style scoped>
.pwa-toast {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  font-size: 0.875rem;
  max-width: 90vw;
}
.pwa-toast__msg { flex: 1 1 auto; }
.pwa-toast__btn {
  background: transparent;
  border: 1px solid var(--vp-c-divider);
  color: inherit;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  font: inherit;
  cursor: pointer;
}
.pwa-toast__btn:hover { border-color: var(--vp-c-brand-1); }
.pwa-toast__btn--primary {
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  border-color: var(--vp-c-brand-1);
}
.pwa-toast__btn--primary:hover { background: var(--vp-c-brand-2); }
.pwa-toast-enter-active, .pwa-toast-leave-active { transition: all 0.25s ease; }
.pwa-toast-enter-from, .pwa-toast-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
</style>
