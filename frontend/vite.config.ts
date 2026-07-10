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
      // Три независимых входа: основное приложение (index.html), клиентский
      // портал (portal.html) и публичный продающий лендинг (landing.html).
      // Портал и лендинг — отдельные бандлы, не делят код с основным SPA;
      // лендинг отдаётся бэкендом на корне домена (см. backend serve_spa).
      input: {
        main: entry('index.html'),
        portal: entry('portal.html'),
        landing: entry('landing.html'),
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
