import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // pg is a Node.js-only package used only in /scripts — keep it out of the browser bundle
      external: ['pg'],
    },
  },
})
