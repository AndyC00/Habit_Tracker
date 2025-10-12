import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Use relative base so built assets work when served from any subpath
  // Fixes blank page when using `npx serve -s dist` or GitHub Pages
  base: "./",
})
