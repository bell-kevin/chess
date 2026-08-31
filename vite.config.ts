import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs, so the same build works wherever it is served from:
  // the project page at /chess/, a user page at /, or a custom domain. Without
  // this, GitHub Pages serves the app under /chess/ while index.html asks for
  // /assets/... at the domain root and the page comes up blank.
  base: './',
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
