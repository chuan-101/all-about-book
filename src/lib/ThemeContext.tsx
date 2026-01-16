import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type Theme = 'retro-cafe' | 'retro-keyboard' | 'pixel-dream' | 'pixel-farm'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const THEME_STORAGE_KEY = 'all-about-book:theme'
const DEFAULT_THEME: Theme = 'retro-cafe'
const AVAILABLE_THEMES: Theme[] = [
  'retro-cafe',
  'retro-keyboard',
  'pixel-dream',
  'pixel-farm',
]

const isTheme = (value: string | null): value is Theme =>
  !!value && AVAILABLE_THEMES.includes(value as Theme)

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isTheme(stored) ? stored : DEFAULT_THEME
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

type ThemeProviderProps = {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      setTheme: setThemeState,
      toggleTheme: () =>
        setThemeState((current) => {
          const currentIndex = AVAILABLE_THEMES.indexOf(current)
          const nextIndex =
            currentIndex === -1
              ? 0
              : (currentIndex + 1) % AVAILABLE_THEMES.length
          return AVAILABLE_THEMES[nextIndex]
        }),
    }),
    [theme],
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
