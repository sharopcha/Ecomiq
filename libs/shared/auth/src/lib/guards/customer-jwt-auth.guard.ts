import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Verifies a customer RS256 access token (via `CustomerJwtAccessStrategy`)
 * against crm's own JWKS. Unlike the staff `JwtAuthGuard`, this is never
 * registered globally — it's applied per-route/per-controller via
 * `@CustomerAuth()` (or directly), so there's no `@Public()` bypass logic
 * needed here.
 */
@Injectable()
export class CustomerJwtGuard extends AuthGuard('jwt-customer-access') {}
