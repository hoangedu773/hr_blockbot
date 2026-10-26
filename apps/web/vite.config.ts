import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
