import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Dev: the Express API runs on :3001; the browser only talks to :5173.
    proxy: { '/api': 'http://localhost:3001' },
  },
});
