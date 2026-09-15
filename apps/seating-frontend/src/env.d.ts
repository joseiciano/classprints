/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_SEATING_API_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
