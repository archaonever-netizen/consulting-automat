import { defineConfig } from 'vitest/config'

// Конфиг тестов отдельно от vite.config.ts: чистым логическим тестам react-плагин
// не нужен, а так избегаем конфликта типов вложенного vite внутри vitest.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
