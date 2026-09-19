import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test/setup.ts'],
    server: {
      deps: {
        // The generated Prisma client ships CJS inside the workspace and must
        // not be transformed by vite.
        external: [/packages[\\/]database[\\/]src/],
      },
    },
  },
});
