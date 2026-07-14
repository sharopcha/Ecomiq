import type { Config } from 'jest';

const config: Config = {
  displayName: 'catalog-service',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  setupFiles: ['<rootDir>/../../../jest.setup.ts'],
  // Jest doesn't understand tsconfig `paths` at runtime (same reason the
  // catalog:events:* npm scripts need tsconfig-paths/register for ts-node) —
  // map the @temp-nx/* aliases straight to each lib's source entrypoint.
  moduleNameMapper: {
    '^@temp-nx/(.*)$': '<rootDir>/../../../libs/shared/$1/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
};

export default config;
