import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API = process.env['SKILLER_API'] ?? 'http://127.0.0.1:4280';

export default defineConfig({
  // Relative asset paths, so the static build works from any host and any sub-path.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env['WEB_PORT'] ?? 5273),
    proxy: { '/api': API, '/mcp': API },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    css: false,
  },
});
