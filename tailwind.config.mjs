/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        democrat: '#2563eb',
        republican: '#dc2626',
        independent: '#7c3aed',
      },
    },
  },
  plugins: [],
};
