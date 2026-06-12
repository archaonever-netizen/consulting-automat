import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Стабильный vendor-чанк: реже меняется → дольше живёт в кэше браузера
        // и даёт маленькие диффы в закоммиченном dist при деплое.
        // react-markdown сюда не включаем: он нужен только 3 страницам и
        // должен остаться в их ленивом чанке.
        codeSplitting: {
          groups: [
            {
              name: 'vendor',
              test: /[\\/]node_modules[\\/](?:(?:react|react-dom|scheduler|react-router|react-router-dom|axios)[\\/]|@tanstack[\\/])/,
            },
          ],
        },
      },
    },
  },
})
