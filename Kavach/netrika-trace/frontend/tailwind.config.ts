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
        ink: v('ink'),
        'on-ink': v('on-ink'),
        accent: { DEFAULT: v('accent'), on: v('on-accent'), deep: v('accent-deep'), soft: v('accent-soft'), fg: v('accent-fg') },
        success: { DEFAULT: v('success'), soft: v('success-soft'), fg: v('success-fg') },
        warn: { DEFAULT: v('warn'), soft: v('warn-soft'), fg: v('warn-fg') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft'), fg: v('danger-fg') },
        aurora: {
          blue: v('a-blue'),
          violet: v('a-violet'),
          pink: v('a-pink'),
          mint: v('a-mint'),
          peach: v('a-peach'),
          sun: v('a-sun'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
        glow: 'var(--shadow-glow)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '28px',
      },
      transitionTimingFunction: { smooth: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      keyframes: {
        drift1: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(30px,20px) scale(1.15)' } },
        drift2: { '0%,100%': { transform: 'translate(0,0) scale(1.1)' }, '50%': { transform: 'translate(-26px,-14px) scale(0.95)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
      },
      animation: {
        drift1: 'drift1 14s ease-in-out infinite',
        drift2: 'drift2 18s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
