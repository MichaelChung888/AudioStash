import { configDefaults, defineConfig } from 'vitest/config';

// Unit tests run everywhere. Integration tests (*.int.test.ts) start real Postgres
// and RabbitMQ containers with Testcontainers, so they need Docker.
export const unitConfig = defineConfig({
  test: { exclude: [...configDefaults.exclude, '**/*.int.test.ts'] },
});

export const integrationConfig = defineConfig({
  test: {
    include: ['**/*.int.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Containers are shared within a file; files run one after another to limit memory use.
    fileParallelism: false,
  },
});
