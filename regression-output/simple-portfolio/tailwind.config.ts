import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        'primary-light': 'var(--primary-light)',
        'primary-dark': 'var(--primary-dark)',
        'surface-light': 'var(--surface-light)',
        'surface-dark': 'var(--surface-dark)',
        'on-surface-light': 'var(--on-surface-light)',
        'on-surface-dark': 'var(--on-surface-dark)',
        'accent-light': 'var(--accent-light)',
        'accent-dark': 'var(--accent-dark)',
        'muted-light': 'var(--muted-light)',
        'muted-dark': 'var(--muted-dark)',
        'on-muted-light': 'var(--on-muted-light)',
        'on-muted-dark': 'var(--on-muted-dark)',
        'error-light': 'var(--error-light)',
        'error-dark': 'var(--error-dark)'
      },
      spacing: {
        baseUnit: '--base-unit',
        xs: '--xs',
        sm: '--sm',
        md: '--md',
        lg: '--lg',
        xl: '--xl'
      }
    }
  },
  plugins: []
};

export default config;