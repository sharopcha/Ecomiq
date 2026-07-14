import type { Config } from 'jest';

const config: Config = {
  displayName: 'payment-service',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  setupFiles: ['<rootDir>/../../../jest.setup.ts'],
  // Jest doesn't understand tsconfig `paths` at runtime — same reasoning
  // (and same mapping) as catalog/inventory-service's jest.config.ts.
  moduleNameMapper: {
    '^@temp-nx/(.*)$': '<rootDir>/../../../libs/shared/$1/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
};

export default config;
