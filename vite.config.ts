import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 5186/4186. The siblings hold 5183–5185 and 4183–4185, and `strictPort`
  // turns a collision into a refusal to start rather than a silent hop to
  // another port — which from phase 03 would also be a relay on the wrong port.
  server: { port: 5186, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
