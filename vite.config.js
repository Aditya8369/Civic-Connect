import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'vendor-firebase'
            }
            if (id.includes('leaflet')) {
              return 'vendor-leaflet'
            }
            if (
              id.includes('@radix-ui') ||
              id.includes('lucide-react') ||
              id.includes('framer-motion') ||
              id.includes('class-variance-authority') ||
              id.includes('clsx') ||
              id.includes('tailwind-merge')
            ) {
              return 'vendor-ui'
            }
          }
        },
      },
    },
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'vendor-firebase'
            }
            if (id.includes('leaflet')) {
              return 'vendor-leaflet'
            }
            if (
              id.includes('@radix-ui') ||
              id.includes('lucide-react') ||
              id.includes('framer-motion') ||
              id.includes('class-variance-authority') ||
              id.includes('clsx') ||
              id.includes('tailwind-merge')
            ) {
              return 'vendor-ui'
            }
          }
        },
      },
    },
  },
})
