import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  Public,
  RequirePermissions,
  PermissionsGuard,
  AuthenticatedUser,
} from '@temp-nx/auth';
import { AuthService, LoginOutcome } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { SetupStoreDto } from './dto/setup-store.dto';
import { LoginDto } from './dto/login.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { Enable2faDto } from './dto/enable-2fa.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { SelectStoreDto } from './dto/select-store.dto';
import { ClientCredentialsDto } from './dto/client-credentials.dto';
import type { StaffLoginResponseDto } from '@temp-nx/api-types/identity';

@Controller('auth')
export class AuthController {
  private readonly cookieName: string;
  private readonly cookieMaxAgeMs: number;

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {
    this.cookieName = this.config.get<string>(
      'REFRESH_TOKEN_COOKIE_NAME',
      'ecomiq_rt',
    );
    const days = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS', 30));
    this.cookieMaxAgeMs = days * 24 * 60 * 60 * 1000;
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: this.cookieMaxAgeMs,
      path: '/api/auth',
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(this.cookieName, { path: '/api/auth' });
  }

  private respondWithOutcome(res: Response, outcome: LoginOutcome): StaffLoginResponseDto {
    if (outcome.status === 'ok') {
      this.setRefreshCookie(res, outcome.refreshToken);
      const { refreshToken: _rt, ...body } = outcome;
      return body;
    }
    return outcome;
  }

  // ── Registration / login ─────────────────────────────────────────────

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const outcome = await this.auth.register(dto);
    return this.respondWithOutcome(res, outcome);
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @Req() req: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as any;
    const outcome = await this.auth.login(user, dto.storeId);
    return this.respondWithOutcome(res, outcome);
  }

  @Public()
  @Post('select-store')
  async selectStore(
    @Body() dto: SelectStoreDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const outcome = await this.auth.selectStore(dto.selectionToken, dto.storeId);
    return this.respondWithOutcome(res, outcome);
  }

  @Public()
  @Post('setup-store')
  async setupStore(
    @Body() dto: SetupStoreDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const outcome = await this.auth.setupStore(dto);
    return this.respondWithOutcome(res, outcome);
  }

  @Public()
  @Post('2fa/verify')
  async verify2fa(
    @Body() dto: Verify2faDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const outcome = await this.auth.verifyTotpAndLogin(
      dto.mfaToken,
      dto.code,
      dto.storeId,
    );
    return this.respondWithOutcome(res, outcome);
  }

  // ── Service-to-service (client-credentials) ───────────────────────────

  @Public()
  // Tighter than the service-level default (120/60s) — this is a
  // credential-guessing surface, brute-force protection matters more here
  // than throughput.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('token')
  async issueToken(@Body() dto: ClientCredentialsDto) {
    return this.auth.issueInternalToken(dto);
  }

  // ── Google OAuth2 ─────────────────────────────────────────────────────

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleLogin() {
    // Passport redirects to Google; body never runs.
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req.user as any;
    const outcome = await this.auth.login(user, undefined);
    const webUrl = this.config.get<string>('APP_WEB_URL', 'http://localhost:4200');

    if (outcome.status === 'ok') {
      this.setRefreshCookie(res, outcome.refreshToken);
      return res.redirect(
        `${webUrl}/auth/oauth-callback?accessToken=${encodeURIComponent(outcome.accessToken)}`,
      );
    }
    if (outcome.status === 'mfa_required') {
      return res.redirect(
        `${webUrl}/auth/verify-2fa?mfaToken=${encodeURIComponent(outcome.mfaToken)}`,
      );
    }
    if (outcome.status === 'setup_required') {
      return res.redirect(
        `${webUrl}/auth/setup-store?setupToken=${encodeURIComponent(outcome.setupToken)}`,
      );
    }
    return res.redirect(
      `${webUrl}/auth/select-store?selectionToken=${encodeURIComponent(outcome.selectionToken)}` +
        `&stores=${encodeURIComponent(JSON.stringify(outcome.stores))}`,
    );
  }

  // ── Refresh / logout ──────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[this.cookieName];
    if (!token) throw new BadRequestException('No refresh token cookie present');
    const { accessToken, refreshToken } = await this.auth.refresh(token);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @Public()
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[this.cookieName];
    if (token) await this.auth.logout(token);
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  // ── Profile ───────────────────────────────────────────────────────────

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  // ── 2FA management (requires an existing access token) ───────────────

  @Post('2fa/setup')
  setup2fa(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.setup2fa(user.id);
  }

  @Post('2fa/enable')
  enable2fa(@CurrentUser() user: AuthenticatedUser, @Body() dto: Enable2faDto) {
    return this.auth.enable2fa(user.id, dto.code);
  }

  @Post('2fa/disable')
  disable2fa(@CurrentUser() user: AuthenticatedUser, @Body() dto: Enable2faDto) {
    return this.auth.disable2fa(user.id, dto.code);
  }

  // ── Password reset ────────────────────────────────────────────────────

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  // ── Invitations ───────────────────────────────────────────────────────

  @UseGuards(PermissionsGuard)
  @RequirePermissions('people:manage')
  @Post('invitations')
  createInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.auth.createInvitation(user.storeId, user.id, dto.email, dto.role);
  }

  @Public()
  @Post('invitations/accept')
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const outcome = await this.auth.acceptInvitation(dto);
    return this.respondWithOutcome(res, outcome);
  }
}
