import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // One accent per parent so the week grid is scannable at a glance
        // without needing to read names on a phone screen.
        parent: { a: '#2563eb', b: '#059669', c: '#c026d3' },
      },
    },
  },
  plugins: [],
};
export default config;
