import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');
  return {
    root: 'web',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'web/src'),
        '@shared': path.resolve(import.meta.dirname, 'shared'),
      },
    },
    build: {
      outDir: path.resolve(import.meta.dirname, 'dist/web'),
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      port: 5173,
      proxy: { '/api': `http://localhost:${env.PORT || 3000}` },
    },
  };
});
