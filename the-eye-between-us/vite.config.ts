import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { handleInterpret } from './server/interpretHandler';

function aiProxy(): Plugin {
  const mount = (server: { middlewares: { use: (path: string, fn: (req: any, res: any) => void) => void } }) => {
    server.middlewares.use('/api/interpret', (req, res) => void handleInterpret(req, res));
  };
  return { name: 'eye-ai-proxy', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig({
  plugins: [{
    name: 'local-inference-module',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/ort/ort-wasm-simd-threaded.mjs') return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.end(readFileSync(new URL('./public/ort/ort-wasm-simd-threaded.mjs', import.meta.url)));
      });
    },
  }, aiProxy()],
  server: { host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
