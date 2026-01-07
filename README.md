# All About Book

Personal reading tracker scaffolded with React + TypeScript + Vite. This Stage 1
implementation focuses on local book management and persistence.

## Stage 1 Scope
- React + TypeScript + Vite foundation.
- React Router navigation for Home, Books, and Book Detail pages.
- Book CRUD (create, edit, delete, view) with localStorage persistence.
- Cover handling via a **cover image URL string** stored locally.
- Placeholder sections for upcoming modules (check-ins, quotes, review/recap).

## Backup & Archive (Export / Import)
The Home page includes a **Data Backup & Archive** card with four actions:
- **Export Backup (JSON):** downloads `all-about-book-backup-YYYY-MM-DD.json` for full restore.
- **Import Backup (JSON):** select a backup file, confirm overwrite, and restore data.
- **Export Archive (Markdown):** downloads `all-about-book-archive-YYYY-MM-DD.md`.
- **Export Archive (HTML):** downloads `all-about-book-archive-YYYY-MM-DD.html` for printing.

Import will replace existing local data (books, check-ins, excerpts). Keep your
backup file safe.

## Tech Stack Notes
- Frontend: React + TypeScript + Vite.
- Stage 1 uses local storage only.
- Stage 2 will add Supabase for auth, sync, and cover storage.
- AI integration will be handled through a backend proxy (no keys in frontend).

## Getting Started
```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.
