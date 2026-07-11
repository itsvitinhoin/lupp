import { defineConfig } from 'vitest/config';
import path from 'path';

const alias = {
  '@': path.resolve(__dirname, './src'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'http',
          include: ['src/http/**/*.spec.ts'],
          environment: path.resolve(
            __dirname,
            'prisma/vitest-environment-prisma/prisma-test-environment.ts',
          ),
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/http/**/*.spec.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
