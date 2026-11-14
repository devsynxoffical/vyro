import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The PHP API is served by the web host next to the site. For local work, run
// it with PHP's built-in server and let Vite forward /api and /uploads to it:
//   VYRO_CONFIG=/path/to/config.php php -S 127.0.0.1:8791 ../platform/tests/php/router.php
const backend = process.env.VYRO_API ?? 'http://127.0.0.1:8791';
const proxy = { '/api': backend, '/uploads': backend };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
