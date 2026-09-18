import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: 'var(--primary-light)',
          dark: 'var(--primary-dark)'
        },
        surface: {
          light: 'var(--surface-light)',
          dark: 'var(--surface-dark)'
        },
        'on-surface': {
          light: 'var(--on-surface-light)',
          dark: 'var(--on-surface-dark)'
        },
        accent: {
          light: 'var(--accent-light)',
          dark: 'var(--accent-dark)'
        },
        muted: {
          light: 'var(--muted-light)',
          dark: 'var(--muted-dark)'
        },
        'on-muted': {
          light: 'var(--on-muted-light)',
          dark: 'var(--on-muted-dark)'
        },
        error: {
          light: 'var(--error-light)',
          dark: 'var(--error-dark)'
        }
      },
      fontFamily: {
        display: ['var(--font-display-family)'],
        text: ['var(--font-text-family)']
      },
      fontSize: {
        xs: 'var(--clamp-xs)',
        sm: 'var(--clamp-sm)',
        base: 'var(--clamp-base)',
        lg: 'var(--clamp-lg)',
        xl: 'var(--clamp-xl)',
        '2xl': 'var(--clamp-2xl)',
        '3xl': 'var(--clamp-3xl)',
        display: 'var(--clamp-display)'
      },
      lineHeight: {
        xs: 'var(--line-height-xs)',
        sm: 'var(--line-height-sm)',
        base: 'var(--line-height-base)',
        lg: 'var(--line-height-lg)',
        xl: 'var(--line-height-xl)',
        '2xl': 'var(--line-height-2xl)',
        '3xl': 'var(--line-height-3xl)',
        display: 'var(--line-height-display)'
      },
      spacing: {
        xs: 'var(--xs)',
        sm: 'var(--sm)',
        md: 'var(--md)',
        lg: 'var(--lg)',
        xl: 'var(--xl)',
        '2xl': 'var(--2xl)'
      },
      maxWidth: {
        container: 'var(--max-width)'
      },
      transitionDuration: {
        DEFAULT: 'var(--default-duration)'
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--default-easing)'
      }
    }
  },
  plugins: []
};

export default config;