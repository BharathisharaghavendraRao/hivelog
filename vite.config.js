import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel / local: `/`
// GitHub Pages project site: `/hivelog/` (set GITHUB_PAGES=true)
const base = process.env.GITHUB_PAGES === 'true' ? '/hivelog/' : '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base,
})
