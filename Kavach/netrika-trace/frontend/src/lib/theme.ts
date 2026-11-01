import { create } from 'zustand'

type Theme = 'light' | 'dark'

function read(): Theme {
  try {
    return localStorage.getItem('netrika_theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem('netrika_theme', t)
  } catch {
    /* storage unavailable */
  }
}

export const useTheme = create<{ theme: Theme; toggle: () => void }>((set, get) => ({
  theme: read(),
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    apply(next)
    set({ theme: next })
  },
}))
