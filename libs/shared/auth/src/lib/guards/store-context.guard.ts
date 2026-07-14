import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Runs after JwtAuthGuard (registered as
 * a global `APP_GUARD` in catalog/inventory's app.module.ts, in that provider
 * order, since guard order follows provider order). Asserts the *end-user*
 * token carries a store_id and exposes it as `req.storeId` for downstream
 * repositories to scope queries by tenant (`WHERE store_id = :ctx`).
 *
 * Postgres RLS is **deferred** (explicitly out of scope for now) — tenant
 * isolation today rests entirely on this guard plus each service method
 * calling `scopeToStore`, not a DB-level backstop. Don't assume RLS exists
 * when reasoning about this guard's blast radius.
 *
 * Two bypasses, both required:
 *
 * 1. `@Public()` routes — same reflector check `JwtAuthGuard` does. Without
 *    it, a public route would have no `req.user` (JwtAuthGuard already
 *    skipped) and this guard would reject it with a spurious 401 instead of
 *    actually being public.
 * 2. Non-HTTP execution contexts — Pulsar's `CatalogSyncController` and
 *    inventory's gRPC `ReservationGrpcController` are both already
 *    `@Public()` at the class level (the `JwtAuthGuard`/global-guard-on-RPC-
 *    context gotcha those controllers document), so bypass 1 alone would
 *    cover them — but `context.getType()` is checked explicitly too, as a
 *    second, independent line of defense for any future RPC/event handler
 *    that forgets the `@Public()` annotation. Internal (client-credentials)
 *    tokens never carry a `store_id` by design and the gRPC
 *    reservation contract carries `store_id` in the request payload
 *    instead — this guard has no business running against either transport.
 */
@Injectable()
export class StoreContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest();
    const storeId = req.user?.storeId;
    if (!storeId) {
      throw new UnauthorizedException('Token is missing store context');
    }
    req.storeId = storeId;
    return true;
  }
}
