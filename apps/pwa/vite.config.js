import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite is the build tool: it serves the app with instant reload in dev, and
// bundles it into static files (dist/) for Cloudflare Pages in production.
export default defineConfig({
  plugins: [react()],
  build: {
    // Workers/Pages and every modern mobile browser handle this fine.
    target: 'es2022',
  },
});
