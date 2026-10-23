import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0b0e',
        bg2: 'rgba(28, 30, 36, 0.92)',
        bg3: 'rgba(42, 44, 52, 0.95)',
        border: 'rgba(255, 255, 255, 0.08)',
        red: '#f43f5e',
        'red-dim': 'rgba(244, 63, 94, 0.12)',
        green: '#5c9e7a',
        'green-dim': 'rgba(92, 158, 122, 0.12)',
        amber: '#f59e0b',
        'amber-dim': 'rgba(245, 158, 11, 0.12)',
        blue: '#6366f1',
        text: '#f0f2f7',
        'text-dim': '#8b90a0',
        grapho: {
          orange: '#f97316',
          sage: '#6b9b7a',
          gold: '#e8c547',
          surface: '#16181e',
          'surface-2': '#1c1e26',
          rail: '#22252e',
        },
      },
      fontFamily: {
        display: ['DM Sans', 'Inter', 'sans-serif'],
        sans: ['DM Sans', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        glass: '0 12px 40px rgba(0, 0, 0, 0.45)',
        'glass-sm': '0 4px 20px rgba(0, 0, 0, 0.35)',
        soft: '0 1px 2px rgba(0, 0, 0, 0.2)',
        lift: '0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.04)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      }
    },
  },
  plugins: [],
}

export default config
