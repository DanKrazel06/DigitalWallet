import { defineConfig } from 'vitest/config'

// Vitest config for transaction-service.
//
// - Targets the src/ directory for source resolution.
// - Excludes Prisma's generated client (no value in testing generated code).
// - Reporter: 'verbose' so test names print one per line — easier to read
//   in CI logs than the default dot reporter.
// - Coverage collected via v8 (Node's native coverage); HTML report
//   landing in coverage/ for human inspection, lcov for CI tools.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'src/generated/**'],
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['src/generated/**', 'src/main.ts', 'tests/**', '**/*.config.ts'],
    },
  },
})
