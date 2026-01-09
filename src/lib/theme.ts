const THEME_STORAGE_KEY = 'all-about-book:theme'
const DEFAULT_THEME = 'light'
const AVAILABLE_THEMES = ['light', 'paper'] as const

type ThemeOption = (typeof AVAILABLE_THEMES)[number]

const isThemeOption = (theme: string): theme is ThemeOption =>
  AVAILABLE_THEMES.includes(theme as ThemeOption)

export const getTheme = (): ThemeOption => {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return stored && isThemeOption(stored) ? stored : DEFAULT_THEME
}

export const setTheme = (theme: string) => {
  if (typeof document === 'undefined') {
    return
  }

  const nextTheme = isThemeOption(theme) ? theme : DEFAULT_THEME
  document.documentElement.dataset.theme = nextTheme

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
  }
}
