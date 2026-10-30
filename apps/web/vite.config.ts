import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages[\\/]contracts[\\/]dist/],
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
