import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Neon_Runner_3D/',
  build: { outDir: 'docs' }   
})
