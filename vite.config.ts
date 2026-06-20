import { defineConfig } from 'vite';

// Single self-contained app. No framework plugins needed.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
