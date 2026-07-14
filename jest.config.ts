import type { Config } from 'jest';

/**
 * Plain multi-project Jest setup — deliberately not using the `@nx/jest`
 * plugin/generator (banned after `nx generate` crashed the sandbox earlier
 * in this project; see prior conversation notes). Each project below has
 * its own jest.config.ts + tsconfig.spec.json.
 */
const config: Config = {
  projects: [
    '<rootDir>/apps/gateway/api-gateway/jest.config.ts',
    '<rootDir>/apps/services/identity/jest.config.ts',
    '<rootDir>/apps/services/catalog/jest.config.ts',
    '<rootDir>/apps/services/inventory/jest.config.ts',
    '<rootDir>/apps/services/order/jest.config.ts',
    '<rootDir>/apps/services/payment/jest.config.ts',
    '<rootDir>/apps/services/marketing/jest.config.ts',
    '<rootDir>/apps/services/notification/jest.config.ts',
    '<rootDir>/apps/services/shipping/jest.config.ts',
    '<rootDir>/apps/services/crm/jest.config.ts',
    '<rootDir>/apps/services/purchasing/jest.config.ts',
    '<rootDir>/apps/services/media/jest.config.ts',
    '<rootDir>/libs/shared/auth/jest.config.ts',
    '<rootDir>/libs/shared/typeorm/jest.config.ts',
    '<rootDir>/libs/contracts/jest.config.ts',
  ],
};

export default config;
