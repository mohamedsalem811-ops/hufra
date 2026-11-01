import { defineConfig } from 'vitest/config'

// Unit/integration tests run under plain Node (not the Workers runtime).
// All src/lib/* modules are written using only Web-standard APIs
// (Web Crypto, TextEncoder, btoa/atob, URL, URLSearchParams) which Node 18+
// implements natively, so no Workers pool/shim is required for these tests.
// Route handlers (src/routes/*) that need D1/KV/R2 bindings are covered by
// the integration tests using lightweight in-memory fakes of those bindings
// (see tests/integration/helpers/fake-bindings.ts) rather than spinning up
// Miniflare, keeping the suite fast and dependency-free.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/lib/**/*.ts', 'src/routes/**/*.ts', 'src/middleware/**/*.ts'],
      exclude: ['src/pages/**', 'src/index.tsx'],
    },
  },
})
