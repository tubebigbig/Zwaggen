import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import PwaUpdateToast from './PwaUpdateToast.vue';
import HeroInstall from './HeroInstall.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => h(PwaUpdateToast),
      'home-hero-image': () => h(HeroInstall),
    });
  },
} satisfies Theme;
