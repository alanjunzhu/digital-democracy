import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://alanjunzhu.github.io',
  base: '/digital-democracy/',
  integrations: [
    react(),
    tailwind(),
    sitemap(),
  ],
  output: 'static',
});
