const HomeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
)

const BookIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 4.5h11a3 3 0 0 1 3 3V20a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2V6.5a2 2 0 0 1 2-2z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M5 7h11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  </svg>
)

const ConsoleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 5h16v14H4z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M8 9l3 3-3 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12.5 15h3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M4.8 12a7.2 7.2 0 0 1 .12-1.2l-2.12-1.65 1.9-3.3 2.5 1a7.6 7.6 0 0 1 2.1-1.2l.4-2.7h3.8l.4 2.7a7.6 7.6 0 0 1 2.1 1.2l2.5-1 1.9 3.3-2.12 1.65c.08.4.12.8.12 1.2s-.04.8-.12 1.2l2.12 1.65-1.9 3.3-2.5-1a7.6 7.6 0 0 1-2.1 1.2l-.4 2.7h-3.8l-.4-2.7a7.6 7.6 0 0 1-2.1-1.2l-2.5 1-1.9-3.3 2.12-1.65c-.08-.4-.12-.8-.12-1.2z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
)

interface BottomNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onOpenConsole: () => void
}

function BottomNav({ activeTab, onTabChange, onOpenConsole }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <button
        type="button"
        className={`bottom-nav-item${activeTab === 'home' ? ' active' : ''}`}
        aria-current={activeTab === 'home' ? 'page' : undefined}
        onClick={() => onTabChange('home')}
      >
        <span className="bottom-nav-icon">
          <HomeIcon />
        </span>
        <span className="bottom-nav-label">首页</span>
      </button>
      <button
        type="button"
        className={`bottom-nav-item${
          activeTab === 'bookshelf' ? ' active' : ''
        }`}
        aria-current={activeTab === 'bookshelf' ? 'page' : undefined}
        onClick={() => onTabChange('bookshelf')}
      >
        <span className="bottom-nav-icon">
          <BookIcon />
        </span>
        <span className="bottom-nav-label">书架</span>
      </button>
      <button
        type="button"
        className="bottom-nav-item"
        aria-label="Syzygy Console"
        onClick={onOpenConsole}
      >
        <span className="bottom-nav-icon">
          <ConsoleIcon />
        </span>
        <span className="bottom-nav-label">控制台</span>
      </button>
      <button
        type="button"
        className="bottom-nav-item"
        aria-label="Settings"
        onClick={() => onTabChange('settings')}
      >
        <span className="bottom-nav-icon">
          <SettingsIcon />
        </span>
        <span className="bottom-nav-label">设置</span>
      </button>
    </nav>
  )
}

export default BottomNav
