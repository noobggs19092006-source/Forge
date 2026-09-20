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
        xl: '--xl',
        '2xl': '--2xl'
      },
      extend: {
        fontSize: {
          'clamp-xs-min': 'var(--clamp-xs-min)',
          'clamp-xs-max': 'var(--clamp-xs-max)',
          'clamp-xs': 'var(--clamp-xs)',
          'line-height-xs': 'var(--line-height-xs)',
          'clamp-sm-min': 'var(--clamp-sm-min)',
          'clamp-sm-max': 'var(--clamp-sm-max)',
          'clamp-sm': 'var(--clamp-sm)',
          'line-height-sm': 'var(--line-height-sm)',
          'clamp-base-min': 'var(--clamp-base-min)',
          'clamp-base-max': 'var(--clamp-base-max)',
          'clamp-base': 'var(--clamp-base)',
          'line-height-base': 'var(--line-height-base)',
          'clamp-lg-min': 'var(--clamp-lg-min)',
          'clamp-lg-max': 'var(--clamp-lg-max)',
          'clamp-lg': 'var(--clamp-lg)',
          'line-height-lg': 'var(--line-height-lg)',
          'clamp-xl-min': 'var(--clamp-xl-min)',
          'clamp-xl-max': 'var(--clamp-xl-max)',
          'clamp-xl': 'var(--clamp-xl)',
          'line-height-xl': 'var(--line-height-xl)'
        },
        fontFamily: {
          display: 'var(--font-display-family)',
          text: 'var(--font-text-family)'
        }
      }
    }
  },
  plugins: []
};

export default config;