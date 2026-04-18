/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLAYGROUND?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
