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
- Stage 2 adds Supabase for auth and cloud reads.
- AI integration will be handled through a backend proxy (no keys in frontend).

## Getting Started
```bash
npm install
npm run dev
```

### Supabase (optional)
To enable magic link login and cloud reads, create a `.env.local` file in the repo root:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The app will automatically fall back to local storage if the env vars are missing.

### GitHub Actions secrets
For GitHub Pages builds, add the following repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The app will be available at `http://localhost:5173`.

deploy test


## GitHub Pages base path + PWA
This project is deployed under the GitHub Pages subpath `/all-about-book/`, so Vite `base` and PWA settings must stay aligned with that path.

- Vite base is configured as `/all-about-book/`.
- PWA manifest uses `/all-about-book/` for `start_url` and `scope`.
- Manifest icon paths are relative (`icons/...`) so they resolve under the subpath, not domain root.
- Workbox navigation fallback points to `/all-about-book/index.html`.

If you change Service Worker or manifest settings, **unregister the existing service worker and clear site data** once in your browser before retesting.

