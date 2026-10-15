import { defineConfig } from 'astro/config';
// GitHub Pages project site. SITE/BASE can be overridden by env (set in the deploy workflow).
export default defineConfig({
  site: process.env.SITE_URL || 'https://USERNAME.github.io',
  base: process.env.BASE_PATH || '/kaizo-companion/',
  trailingSlash: 'always', build: { format: 'directory' }, server: { port: 4321, host: true },
});
