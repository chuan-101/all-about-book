import { useTheme } from '../lib/ThemeContext'

const themeLabels = {
  'retro-cafe': '昭和喫茶店',
  'retro-keyboard': '复古键盘',
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const nextTheme =
    theme === 'retro-cafe' ? 'retro-keyboard' : 'retro-cafe'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`切换主题为${themeLabels[nextTheme]}`}
    >
      <span className="theme-toggle-label">主题</span>
      <span className="theme-toggle-current">{themeLabels[theme]}</span>
    </button>
  )
}

export default ThemeToggle
