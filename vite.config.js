import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./src', import.meta.url)),
  base: './', // GitHub Pages 하위 경로(/godsaeng/)와 나중의 앱 포장(Capacitor) 모두에서 동작
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true },
  server: { port: 5180, strictPort: true },
});
