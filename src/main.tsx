import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import { AppProvider } from './lib/app-context.tsx'
import { BooksProvider } from './lib/books-context.tsx'
import './styles/variables.css'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppProvider>
        <BooksProvider>
          <App />
        </BooksProvider>
      </AppProvider>
    </HashRouter>
  </StrictMode>,
)
