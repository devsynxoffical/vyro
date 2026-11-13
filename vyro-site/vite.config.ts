import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serves and builds /vyro.js, the loader clients install on their websites,
 * with the licence-check address filled in from the environment.
 */
function vyroLoader(apiUrl: string): Plugin {
  const source = () =>
    readFileSync(new URL('./src/widget/loader.js', import.meta.url), 'utf8').replace('__VYRO_API__', apiUrl);
  return {
    name: 'vyro-loader',
    configureServer(server) {
      server.middlewares.use('/vyro.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(source());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'vyro.js', source: source() });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), vyroLoader(`${env.VITE_SUPABASE_URL ?? ''}/functions/v1`)],
  };
});
