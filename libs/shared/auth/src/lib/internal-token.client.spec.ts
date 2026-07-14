import { InternalTokenClient } from './internal-token.client';

function mockFetchOnce(accessToken: string, expiresInSeconds: number) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ access_token: accessToken, expires_in: expiresInSeconds }),
  });
}

describe('InternalTokenClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fetches a token on first call', async () => {
    const fetchMock = mockFetchOnce('token-1', 300);
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new InternalTokenClient({
      tokenUrl: 'http://identity/auth/token',
      clientId: 'order-service',
      clientSecret: 'secret',
      now: () => 0,
    });

    const token = await client.getToken();
    expect(token).toBe('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ grant_type: 'client_credentials', client_id: 'order-service', client_secret: 'secret' });
  });

  it('returns the cached token without refetching while under 80% of the TTL', async () => {
    let now = 0;
    const fetchMock = mockFetchOnce('token-1', 300); // 300s TTL -> refresh at 240_000ms
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new InternalTokenClient({
      tokenUrl: 'http://identity/auth/token',
      clientId: 'order-service',
      clientSecret: 'secret',
      now: () => now,
    });

    await client.getToken();
    now = 239_000; // just under the 240_000ms (80%) refresh point
    const token = await client.getToken();

    expect(token).toBe('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches once past 80% of the TTL', async () => {
    let now = 0;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: 'token-1', expires_in: 300 }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: 'token-2', expires_in: 300 }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new InternalTokenClient({
      tokenUrl: 'http://identity/auth/token',
      clientId: 'order-service',
      clientSecret: 'secret',
      now: () => now,
    });

    await client.getToken();
    now = 241_000; // just past the 240_000ms (80%) refresh point
    const token = await client.getToken();

    expect(token).toBe('token-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('single-flights concurrent callers into exactly one fetch', async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new InternalTokenClient({
      tokenUrl: 'http://identity/auth/token',
      clientId: 'order-service',
      clientSecret: 'secret',
      now: () => 0,
    });

    const call1 = client.getToken();
    const call2 = client.getToken();
    const call3 = client.getToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: () => Promise.resolve({ access_token: 'token-1', expires_in: 300 }) });
    const [t1, t2, t3] = await Promise.all([call1, call2, call3]);

    expect(t1).toBe('token-1');
    expect(t2).toBe('token-1');
    expect(t3).toBe('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('includes scope in the request body when configured', async () => {
    const fetchMock = mockFetchOnce('token-1', 300);
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new InternalTokenClient({
      tokenUrl: 'http://identity/auth/token',
      clientId: 'order-service',
      clientSecret: 'secret',
      scope: 'inventory:reserve inventory:release',
      now: () => 0,
    });

    await client.getToken();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.scope).toBe('inventory:reserve inventory:release');
  });

  it('throws on a non-OK response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('bad credentials') });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new InternalTokenClient({
      tokenUrl: 'http://identity/auth/token',
      clientId: 'order-service',
      clientSecret: 'wrong',
      now: () => 0,
    });

    await expect(client.getToken()).rejects.toThrow(/401/);
  });
});
