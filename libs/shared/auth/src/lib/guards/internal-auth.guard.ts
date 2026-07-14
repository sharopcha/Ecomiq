import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InternalTokenVerifierService } from '../internal-token-verifier.service';
import { INTERNAL_SCOPE_KEY } from '../decorators/internal-scope.decorator';

/**
 * HTTP-context guard for routes that should only ever be called by another
 * service, never a browser/end user (e.g. an internal-only REST route, if
 * one is ever added). Verifies the `Authorization: Bearer <token>` header
 * via `InternalTokenVerifierService`, then checks `@RequireInternalScope`
 * metadata against the token's granted scopes.
 *
 * Not wired as a global `APP_GUARD` anywhere — apply per-route/controller
 * with `@UseGuards(InternalAuthGuard)`, same as `PermissionsGuard`.
 * inventory-service's gRPC `ReservationService` does *not* use this
 * guard directly (there's no Express `Request` in a gRPC context) but reuses
 * the same `InternalTokenVerifierService` underneath.
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(
    private readonly verifier: InternalTokenVerifierService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing internal service-credential token',
      );
    }

    const payload = await this.verifier.verify(header.slice(7));

    const required = this.reflector.getAllAndOverride<string[]>(
      INTERNAL_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required?.length) {
      const granted = payload.scope ?? [];
      const ok = required.every((s) => granted.includes(s));
      if (!ok) {
        throw new ForbiddenException(
          `Missing required internal scope(s): ${required.join(', ')}`,
        );
      }
    }

    req.internalPrincipal = {
      clientId: payload.sub,
      service: payload.svc,
      scope: payload.scope,
    };
    return true;
  }
}
