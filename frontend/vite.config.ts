import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Абсолютный путь к html-входу относительно этого конфига (ESM-safe).
const entry = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Два независимых приложения: основное (index.html) и клиентский портал
      // (portal.html). Портал — отдельный бандл, не делит код с основным SPA,
      // чтобы его можно было вынести на отдельный сервер (Этап 3).
      input: {
        main: entry('index.html'),
        portal: entry('portal.html'),
      },
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
