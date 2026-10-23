import type { Config } from 'tailwindcss'

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        subtle: v('subtle'),
        line: v('line'),
        fg: v('fg'),
        muted: v('muted'),
        faint: v('faint'),
        accent: { DEFAULT: v('accent'), soft: v('accent-soft'), fg: v('accent-fg') },
        success: { DEFAULT: v('success'), soft: v('success-soft'), fg: v('success-fg') },
        warn: { DEFAULT: v('warn'), soft: v('warn-soft'), fg: v('warn-fg') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft'), fg: v('danger-fg') },
        // Legacy aliases so not-yet-migrated markup follows the theme.
        border: v('line'),
        text: v('fg'),
        'text-dim': v('muted'),
        red: v('danger'),
        green: v('success'),
        amber: v('warn'),
        blue: v('accent'),
        grapho: { orange: v('accent'), surface: v('surface'), 'surface-2': v('subtle') },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.04)',
        pop: '0 12px 32px rgb(16 24 40 / 0.12), 0 2px 6px rgb(16 24 40 / 0.06)',
        lift: '0 10px 28px rgb(79 70 229 / 0.12)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      transitionTimingFunction: { smooth: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      keyframes: {
        drift1: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(30px,20px) scale(1.15)' } },
        drift2: { '0%,100%': { transform: 'translate(0,0) scale(1.1)' }, '50%': { transform: 'translate(-26px,-14px) scale(0.95)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        drift1: 'drift1 14s ease-in-out infinite',
        drift2: 'drift2 18s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
