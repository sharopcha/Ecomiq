import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import type { Metadata } from '@grpc/grpc-js';
import { InternalTokenVerifierService } from '../internal-token-verifier.service';
import { INTERNAL_SCOPE_KEY } from '../decorators/internal-scope.decorator';

/**
 * gRPC-context counterpart to `InternalAuthGuard` (HTTP-only — it calls
 * `context.switchToHttp().getRequest()`, which throws for an RPC context).
 * Reuses the same `InternalTokenVerifierService` (JWKS-backed,
 * Express-independent) so both transports verify a client-credentials
 * token identically; only the *extraction* differs.
 *
 * Hoisted here from inventory-service's own `reservations/grpc-internal-auth.guard.ts`
 * — payment-service's `PaymentIntentService` needed the exact same guard
 * ("if it feels wrong, hoist" — copying it a second time was the
 * trigger), and marketing's `DiscountService` was a third consumer, so
 * hoisting avoided a near-certain third copy-paste.
 *
 * Extraction: for a NestJS `@GrpcMethod` unary handler, `ServerGrpc` calls
 * `methodHandler(call.request, call.metadata, call)` — Nest's
 * `ExecutionContextHost.switchToRpc()` maps `getData()`/`getContext()` to
 * args[0]/args[1], so `getContext()` here *is* the gRPC `Metadata` object
 * (confirmed against `@nestjs/core`'s `execution-context-host.js`), not an
 * Express request.
 *
 * Throws `RpcException({ code, message })`, not a plain object — verified
 * against `@nestjs/microservices`'s `BaseRpcExceptionFilter.catch()`: it
 * discards any thrown value that isn't `instanceof RpcException` and
 * replaces it with a generic "Internal server error", regardless of
 * transport.
 */
@Injectable()
export class GrpcInternalAuthGuard implements CanActivate {
  constructor(
    private readonly verifier: InternalTokenVerifierService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = context.switchToRpc().getContext<Metadata>();
    const values = metadata.get('authorization');
    const header = values[0]?.toString();

    if (!header?.startsWith('Bearer ')) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Missing internal service-credential token',
      });
    }

    let payload;
    try {
      payload = await this.verifier.verify(header.slice(7));
    } catch {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid or expired internal token',
      });
    }

    const required = this.reflector.getAllAndOverride<string[]>(INTERNAL_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length) {
      const granted = payload.scope ?? [];
      const ok = required.every((s) => granted.includes(s));
      if (!ok) {
        throw new RpcException({
          code: status.PERMISSION_DENIED,
          message: `Missing required internal scope(s): ${required.join(', ')}`,
        });
      }
    }

    return true;
  }
}
