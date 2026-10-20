/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public API origin including the `/api` suffix (e.g. https://api.example.com/api). */
  readonly VITE_API_BASE?: string;
  /** Optional Socket.IO origin. Defaults to the API origin without the `/api` suffix. */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
