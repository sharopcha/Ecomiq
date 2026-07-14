import { ServiceAccountsService } from './service-accounts.service';
import { ServiceAccount } from '../entities/service-account.entity';

/**
 * `resolveScopes` doesn't touch the repository — instantiate with a null
 * repo (cast through `unknown`) rather than pulling in TypeORM/a real
 * DataSource just to exercise pure scope-intersection logic.
 */
describe('ServiceAccountsService#resolveScopes', () => {
  const service = new ServiceAccountsService(
    null as unknown as ConstructorParameters<typeof ServiceAccountsService>[0],
  );

  function account(allowedScopes: string[]): ServiceAccount {
    return { allowedScopes } as ServiceAccount;
  }

  it('returns everything allowed when no scope is requested', () => {
    const result = service.resolveScopes(
      account(['inventory:reserve', 'inventory:release']),
      undefined,
    );
    expect(result).toEqual(['inventory:reserve', 'inventory:release']);
  });

  it('returns everything allowed when an empty scope list is requested', () => {
    const result = service.resolveScopes(account(['inventory:reserve']), []);
    expect(result).toEqual(['inventory:reserve']);
  });

  it('intersects requested scopes with what is allowed', () => {
    const result = service.resolveScopes(
      account(['inventory:reserve', 'inventory:release']),
      ['inventory:reserve', 'orders:write'],
    );
    expect(result).toEqual(['inventory:reserve']);
  });

  it('returns an empty array when nothing requested is allowed', () => {
    const result = service.resolveScopes(account(['inventory:reserve']), [
      'orders:write',
    ]);
    expect(result).toEqual([]);
  });
});
