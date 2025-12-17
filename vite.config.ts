import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Use relative path for easier deployment
  optimizeDeps: {
    // Exclude pdfjs-dist from dependency optimization since we use CDN
    exclude: ['pdfjs-dist'] 
  }
})