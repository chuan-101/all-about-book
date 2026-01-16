import { useTheme } from '../lib/ThemeContext'

const themeLabels = {
  'retro-cafe': '昭和喫茶店',
  'retro-keyboard': '复古键盘',
  'pixel-dream': '像素梦境',
  'pixel-farm': '像素农场',
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const themeOrder = [
    'retro-cafe',
    'retro-keyboard',
    'pixel-dream',
    'pixel-farm',
  ] as const
  const currentIndex = themeOrder.indexOf(theme)
  const nextTheme =
    currentIndex === -1
      ? themeOrder[0]
      : themeOrder[(currentIndex + 1) % themeOrder.length]

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
