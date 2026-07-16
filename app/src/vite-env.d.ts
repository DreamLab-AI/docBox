/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mock' (default, offline) or 'live' (fetch from the control-plane server). */
  readonly VITE_DATA_MODE?: 'mock' | 'live';
  /** Base URL for the control-plane API. Empty means same-origin (dev proxy). */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
