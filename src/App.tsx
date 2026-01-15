import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import Layout from './components/Layout'
import SettingsModal from './components/SettingsModal'
import { ThemeProvider } from './lib/ThemeContext'
import BookDetailPage from './pages/BookDetailPage'
import BooksPage from './pages/BooksPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  return (
    <ThemeProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route
          element={
            <AuthGate>
              <>
                <Layout
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
                <SettingsModal
                  isOpen={isSettingsOpen}
                  onClose={() => setIsSettingsOpen(false)}
                />
              </>
            </AuthGate>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="books" element={<BooksPage />} />
          <Route path="books/:bookId" element={<BookDetailPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ThemeProvider>
  )
}

export default App
