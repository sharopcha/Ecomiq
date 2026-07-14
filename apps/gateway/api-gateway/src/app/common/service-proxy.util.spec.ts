import {
  buildProxyHeaders,
  classifyProxyError,
  extractSetCookies,
  isBodylessMethod,
  rewriteProxyPath,
} from './service-proxy.util';

describe('rewriteProxyPath', () => {
  it('fully strips the prefix when no replacement is given (catalog/inventory)', () => {
    expect(rewriteProxyPath('/api/catalog/vendors', '/api/catalog')).toBe('/vendors');
  });

  it('falls back to "/" when stripping the prefix leaves nothing', () => {
    expect(rewriteProxyPath('/api/catalog', '/api/catalog')).toBe('/');
  });

  it('preserves the query string, since it rides along in `url`', () => {
    expect(rewriteProxyPath('/api/catalog/products?page=2&limit=10', '/api/catalog')).toBe(
      '/products?page=2&limit=10',
    );
  });

  it('replaces the prefix rather than dropping it (auth-proxy)', () => {
    expect(rewriteProxyPath('/api/auth/login', '/api/auth', '/auth')).toBe('/auth/login');
  });

  it('replaces down to the bare replacement when nothing follows the prefix', () => {
    expect(rewriteProxyPath('/api/auth', '/api/auth', '/auth')).toBe('/auth');
  });
});

describe('buildProxyHeaders', () => {
  it('drops hop-by-hop headers', () => {
    const out = buildProxyHeaders(
      { connection: 'keep-alive', 'content-length': '42', authorization: 'Bearer x' },
      { proto: 'https', host: 'app.example.com' },
    );
    expect(out).not.toHaveProperty('connection');
    expect(out).not.toHaveProperty('content-length');
    expect(out['authorization']).toBe('Bearer x');
  });

  it('joins array header values with a comma', () => {
    const out = buildProxyHeaders(
      { 'x-custom': ['a', 'b'] },
      { proto: 'http', host: 'localhost' },
    );
    expect(out['x-custom']).toBe('a, b');
  });

  it('skips falsy header values', () => {
    const out = buildProxyHeaders(
      { 'x-empty': undefined },
      { proto: 'http', host: 'localhost' },
    );
    expect(out).not.toHaveProperty('x-empty');
  });

  it('sets x-forwarded-proto and x-forwarded-host from the forwarding context', () => {
    const out = buildProxyHeaders({}, { proto: 'https', host: 'gateway.example.com' });
    expect(out['x-forwarded-proto']).toBe('https');
    expect(out['x-forwarded-host']).toBe('gateway.example.com');
  });

  it('sets x-forwarded-for when there is no existing value', () => {
    const out = buildProxyHeaders({}, { clientIp: '1.2.3.4', proto: 'http', host: 'x' });
    expect(out['x-forwarded-for']).toBe('1.2.3.4');
  });

  it('comma-appends x-forwarded-for rather than overwriting an existing chain', () => {
    const out = buildProxyHeaders(
      { 'x-forwarded-for': '9.9.9.9' },
      { clientIp: '1.2.3.4', proto: 'http', host: 'x' },
    );
    expect(out['x-forwarded-for']).toBe('9.9.9.9, 1.2.3.4');
  });

  it('omits x-forwarded-for entirely when there is no client IP', () => {
    const out = buildProxyHeaders({}, { proto: 'http', host: 'x' });
    expect(out).not.toHaveProperty('x-forwarded-for');
  });
});

describe('isBodylessMethod', () => {
  it('is true for GET and HEAD', () => {
    expect(isBodylessMethod('GET')).toBe(true);
    expect(isBodylessMethod('HEAD')).toBe(true);
  });

  it('is false for POST/PUT/PATCH/DELETE', () => {
    expect(isBodylessMethod('POST')).toBe(false);
    expect(isBodylessMethod('PUT')).toBe(false);
    expect(isBodylessMethod('PATCH')).toBe(false);
    expect(isBodylessMethod('DELETE')).toBe(false);
  });
});

describe('extractSetCookies', () => {
  it('returns multiple set-cookie values as a proper array', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'a=1; Path=/');
    headers.append('set-cookie', 'b=2; Path=/');
    expect(extractSetCookies(headers)).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('returns an empty array when there are no cookies', () => {
    expect(extractSetCookies(new Headers())).toEqual([]);
  });
});

describe('classifyProxyError', () => {
  it('maps an AbortError (our own timeout) to 504', () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(classifyProxyError(err)).toEqual({
      statusCode: 504,
      body: { statusCode: 504, message: 'Upstream request timed out' },
    });
  });

  it('maps a TimeoutError to 504', () => {
    const err = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    expect(classifyProxyError(err).statusCode).toBe(504);
  });

  it('maps ECONNREFUSED (service down) to 502', () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    expect(classifyProxyError(err)).toEqual({
      statusCode: 502,
      body: { statusCode: 502, message: 'Upstream service unavailable' },
    });
  });

  it('maps ENOTFOUND (bad DNS/host) to 502', () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    expect(classifyProxyError(err).statusCode).toBe(502);
  });

  it('maps a bare undici TypeError with no recognized code to 502 as a safe default', () => {
    const err = new TypeError('fetch failed');
    expect(classifyProxyError(err).statusCode).toBe(502);
  });

  it('maps any other unknown error to 502 rather than throwing/crashing', () => {
    expect(classifyProxyError(new Error('mystery')).statusCode).toBe(502);
    expect(classifyProxyError('not even an Error').statusCode).toBe(502);
  });
});
