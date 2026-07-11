import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Scope coverage to the testable logic layer. UI components have no tests
      // yet, so including them would make the number meaningless/unenforceable.
      include: ['src/lib/**/*.ts', 'src/stores/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        'src/**/*.d.ts',
        // Intentionally untested this round (tracked for a follow-up):
        // network I/O + React hook need fetch/timer mocking; utils is a
        // thin clsx/tailwind-merge wrapper.
        'src/lib/google-sheet-push.ts',
        'src/lib/use-auto-push.ts',
        'src/lib/utils.ts',
      ],
      // Thresholds are set just below the measured baseline so the gate catches
      // regressions without being immediately red. Recalibrate if coverage grows.
      thresholds: {
        statements: 88,
        branches: 78,
        functions: 80,
        lines: 92,
      },
    },
  },
})
