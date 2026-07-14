import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Verifies a supplier RS256 access token (via `SupplierJwtAccessStrategy`)
 * against purchasing's own JWKS. Unlike the staff `JwtAuthGuard`, this is
 * never registered globally — it's applied per-route/per-controller via
 * `@SupplierAuth()` (or directly), so there's no `@Public()` bypass logic
 * needed here.
 */
@Injectable()
export class SupplierJwtGuard extends AuthGuard('jwt-supplier-access') {}
