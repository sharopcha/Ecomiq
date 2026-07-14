import { BadRequestException, Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { AuthService, AuthSession } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

/**
 * All `@Public()` — no principal exists yet for register/login, and refresh
 * reads its principal from the rotating cookie, not a bearer token. Every
 * route here is store-scoped via an explicit `storeId` (body field for
 * register/login; the refresh cookie's own Redis record already carries
 * one, stamped at `issue()` time).
 */
@Controller('auth')
export class AuthController {
  private readonly cookieName: string;
  private readonly cookieMaxAgeMs: number;

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {
    this.cookieName = this.config.get<string>('CRM_REFRESH_TOKEN_COOKIE_NAME', 'ecomiq_customer_rt');
    const days = Number(this.config.get('CRM_REFRESH_TOKEN_TTL_DAYS', 30));
    this.cookieMaxAgeMs = days * 24 * 60 * 60 * 1000;
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: this.cookieMaxAgeMs,
      path: '/api/crm/auth',
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(this.cookieName, { path: '/api/crm/auth' });
  }

  private respond(res: Response, session: AuthSession) {
    this.setRefreshCookie(res, session.refreshToken);
    return { accessToken: session.accessToken };
  }

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.register(dto.storeId, dto);
    return this.respond(res, session);
  }

  @Public()
  // Same brute-force/credential-guessing surface as identity's own login
  // route — keep the global ThrottlerGuard in effect with a tighter limit.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(dto.storeId, dto);
    return this.respond(res, session);
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[this.cookieName];
    if (!token) {
      throw new BadRequestException('No refresh token cookie present');
    }
    const session = await this.auth.refresh(token);
    return this.respond(res, session);
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[this.cookieName];
    if (token) {
      await this.auth.logout(token);
    }
    this.clearRefreshCookie(res);
    return { status: 'ok' };
  }
}
