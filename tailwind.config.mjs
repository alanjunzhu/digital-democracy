/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        card: 'var(--card)',
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
        },
        rule: {
          DEFAULT: 'var(--rule)',
          2: 'var(--rule-2)',
        },
        field: 'var(--field)',
        accent: 'var(--red)',
        yea: 'var(--navy)',
        dem: { DEFAULT: 'var(--dem)', soft: 'var(--dem-soft)' },
        rep: { DEFAULT: 'var(--rep)', soft: 'var(--rep-soft)' },
        ind: { DEFAULT: 'var(--ind)', soft: 'var(--ind-soft)' },
        democrat: 'var(--dem)',
        republican: 'var(--rep)',
        independent: 'var(--ind)',
        'footer-bg': 'var(--footer-bg)',
        'footer-fg': 'var(--footer-fg)',
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['"Public Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '2px',
        sm: '2px',
        md: '2px',
        lg: '2px',
        xl: '2px',
        '2xl': '2px',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
      },
      maxWidth: {
        measure: '1200px',
        prose: '66ch',
      },
    },
  },
  plugins: [],
};
