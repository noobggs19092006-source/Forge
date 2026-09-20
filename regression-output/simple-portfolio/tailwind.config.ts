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
        'on-muted-dark': 'var(--on-muted-dark)'
      },
      spacing: {
        baseUnit: '--base-unit',
        xs: '--xs',
        sm: '--sm',
        md: '--md',
        lg: '--lg',
        xl: '--xl',
        '2xl': '--2xl'
      },
      fontSize: {
        'clamp-xs-min': '--clamp-xs-min',
        'clamp-xs-max': '--clamp-xs-max',
        xs: '--clamp-xs',
        lineHeightXs: '--line-height-xs',
        'clamp-sm-min': '--clamp-sm-min',
        'clamp-sm-max': '--clamp-sm-max',
        sm: '--clamp-sm',
        lineHeightSm: '--line-height-sm',
        base: '--clamp-base',
        lineHeightBase: '--line-height-base',
        lg: '--clamp-lg',
        lineHeightLg: '--line-height-lg',
        'clamp-xl-min': '--clamp-xl-min',
        'clamp-xl-max': '--clamp-xl-max',
        xl: '--clamp-xl',
        lineHeightXl: '--line-height-xl'
      },
      animation: {
        defaultEasing: 'var(--default-easing)',
        defaultDuration: 'var(--default-duration)'
      }
    }
  },
  plugins: []
};

export default config;