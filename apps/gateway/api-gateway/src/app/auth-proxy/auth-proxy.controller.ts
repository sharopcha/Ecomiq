import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { proxyRequest } from '../common/service-proxy';

/**
 * Thin reverse proxy: Angular apps only ever talk to the gateway's origin,
 * so refresh-token cookies set by identity-service round-trip correctly
 * without any cross-site cookie configuration, and the Google OAuth2
 * redirect dance (302 → Google → 302 back to /api/auth/google/callback)
 * just works since we forward redirects verbatim instead of following them.
 *
 * All the forwarding mechanics (raw body passthrough, hop-by-hop header
 * stripping, multi-value set-cookie, 3xx relay, upstream timeout) live in
 * the shared `proxyRequest` handler — this controller only knows
 * its own path-rewrite rule and base URL.
 *
 * identity-service enforces its own auth (its global JwtAuthGuard) on the
 * sub-routes that need it (/auth/me, /auth/2fa/*, /auth/invitations) — this
 * controller is deliberately public and dumb, per "zero-trust: every
 * service verifies the end-user JWT itself" (ADR-5). Unlike catalog/inventory,
 * auth-proxy stays @Public() at the gateway edge too: login,
 * refresh, and the OAuth callback all run before a token exists.
 */
@Controller('auth')
export class AuthProxyController {
  private readonly identityBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.identityBaseUrl = this.config
      .get<string>('IDENTITY_SERVICE_URL', 'http://localhost:3001/api')
      .replace(/\/$/, '');
  }

  // NestJS 11 pins `path-to-regexp` to 8.x, which dropped bare Express 4
  // wildcards (`*`) in favor of named ones (`*path`) — using the old syntax
  // crashes route registration at boot ("pathToRegexp is not a function").
  // `*path` has the same catch-all semantics as the old `*`.
  @Public()
  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      baseUrl: this.identityBaseUrl,
      matchPrefix: '/api/auth',
      replacement: '/auth',
    });
  }
}
