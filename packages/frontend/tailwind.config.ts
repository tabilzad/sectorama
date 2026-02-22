import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark theme palette matching the original HDDB aesthetic
        surface: {
          DEFAULT: '#0f0f13',
          50:  '#1a1a24',
          100: '#22222f',
          200: '#2a2a3a',
          300: '#333345',
        },
        accent: {
          DEFAULT: '#2b908f',
          light:   '#4ec3c2',
          dark:    '#1a6968',
        },
        brand: '#90ee7e',
        danger: '#f45b5b',
        warn:   '#ffd700',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
