import type { Config } from 'jest';

const config: Config = {
  displayName: 'api-gateway',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  setupFiles: ['<rootDir>/../../../jest.setup.ts'],
  // Jest doesn't understand tsconfig `paths` at runtime — map the
  // @temp-nx/* aliases straight to each lib's source entrypoint (same
  // convention as catalog/inventory's jest.config.ts).
  moduleNameMapper: {
    '^@temp-nx/(.*)$': '<rootDir>/../../../libs/shared/$1/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
};

export default config;
