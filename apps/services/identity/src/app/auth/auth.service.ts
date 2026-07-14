import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import type Redis from 'ioredis';
import { Role } from '@temp-nx/auth';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { UsersService } from '../users/users.service';
import { StoresService } from '../stores/stores.service';
import { MembershipsService } from '../memberships/memberships.service';
import { InvitationsService } from '../invitations/invitations.service';
import { MailService } from '../mail/mail.service';
import { TokenService, ClientCredentialsTokenResponse } from './token.service';
import { RefreshTokenService } from './refresh-token.service';
import { TotpService } from './totp.service';
import { RegisterDto } from './dto/register.dto';
import { SetupStoreDto } from './dto/setup-store.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ClientCredentialsDto } from './dto/client-credentials.dto';
import { ServiceAccountsService } from '../service-accounts/service-accounts.service';
import type { StaffMeResponseDto, StaffSetup2faResponseDto } from '@temp-nx/api-types/identity';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_ROUNDS = 12;

function hashOpaqueToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

export type LoginOutcome =
  | {
      status: 'ok';
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string; fullName: string };
      store: { id: string; name: string; role: Role };
    }
  | { status: 'mfa_required'; mfaToken: string }
  | {
      status: 'store_selection_required';
      selectionToken: string;
      stores: { id: string; name: string; role: Role }[];
    }
  | { status: 'setup_required'; setupToken: string };

@Injectable()
export class AuthService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly users: UsersService,
    private readonly stores: StoresService,
    private readonly memberships: MembershipsService,
    private readonly invitations: InvitationsService,
    private readonly mail: MailService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly totp: TotpService,
    private readonly serviceAccounts: ServiceAccountsService,
  ) {}

  // ── Service-to-service (client-credentials) ──────────────────────────

  /** POST /auth/token, grant_type=client_credentials. */
  async issueInternalToken(
    dto: ClientCredentialsDto,
  ): Promise<ClientCredentialsTokenResponse> {
    const account = await this.serviceAccounts.validateCredentials(
      dto.client_id,
      dto.client_secret,
    );
    const requested = dto.scope?.split(' ').filter(Boolean);
    const granted = this.serviceAccounts.resolveScopes(account, requested);
    return this.tokens.issueInternalToken({
      clientId: account.clientId,
      serviceName: account.serviceName,
      scopes: granted,
    });
  }

  // ── Registration ──────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      fullName: '',
    });

    const setupToken = await this.tokens.signSetupChallenge(user.id);
    return {
      status: 'setup_required' as const,
      setupToken,
    };
  }

  // ── Local login ───────────────────────────────────────────────────────

  /** Used by LocalStrategy. Throws on any failure (never reveals which part was wrong). */
  async validateLocalUser(email: string, password: string) {
    const user = await this.users.findByEmailWithSecrets(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return user;
  }

  async login(
    user: { id: string; email: string; fullName: string; totpEnabled: boolean },
    storeId?: string,
  ): Promise<LoginOutcome> {
    if (user.totpEnabled) {
      const mfaToken = await this.tokens.signMfaChallenge(user.id);
      return { status: 'mfa_required', mfaToken };
    }
    return this.resolveStoreAndIssue(user, storeId);
  }

  async verifyTotpAndLogin(
    mfaToken: string,
    code: string,
    storeId?: string,
  ): Promise<LoginOutcome> {
    const payload = await this.tokens.verifyMfaChallenge(mfaToken);
    const user = await this.users.findByIdWithSecrets(payload.sub);
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw new UnauthorizedException('2FA is not enabled for this account');
    }
    if (!(await this.totp.verify(code, user.totpSecret))) {
      throw new UnauthorizedException('Invalid authentication code');
    }
    return this.resolveStoreAndIssue(user, storeId);
  }

  /** Redeems a `store_selection_required` outcome's selectionToken — no password/2FA re-entry needed. */
  async selectStore(selectionToken: string, storeId: string): Promise<LoginOutcome> {
    const payload = await this.tokens.verifyStoreSelection(selectionToken);
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return this.resolveStoreAndIssue(user, storeId);
  }

  private async resolveStoreAndIssue(
    user: { id: string; email: string; fullName: string },
    storeId?: string,
  ): Promise<LoginOutcome> {
    const memberships = await this.memberships.findAllForUser(user.id);
    if (memberships.length === 0) {
      const setupToken = await this.tokens.signSetupChallenge(user.id);
      return {
        status: 'setup_required' as const,
        setupToken,
      };
    }

    let target = storeId
      ? memberships.find((m) => m.storeId === storeId)
      : memberships[0];

    if (!storeId && memberships.length > 1) {
      const selectionToken = await this.tokens.signStoreSelection(user.id);
      return {
        status: 'store_selection_required',
        selectionToken,
        stores: memberships.map((m) => ({
          id: m.storeId,
          name: m.store?.name ?? m.storeId,
          role: m.role as Role,
        })),
      };
    }
    if (!target) {
      throw new UnauthorizedException('You do not have access to that store');
    }

    await this.users.touchLastLogin(user.id);
    return this.issueSession(
      user.id,
      user.email,
      user.fullName,
      target.storeId,
      target.role as Role,
      target.store?.name,
    );
  }

  private async issueSession(
    userId: string,
    email: string,
    fullName: string,
    storeId: string,
    role: Role,
    storeName?: string,
  ): Promise<LoginOutcome> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccessToken({ userId, storeId, role }),
      this.refreshTokens.issue(userId, storeId),
    ]);
    const store = storeName
      ? { id: storeId, name: storeName, role }
      : await this.storeSummary(storeId, role);
    return {
      status: 'ok',
      accessToken,
      refreshToken,
      user: { id: userId, email, fullName },
      store,
    };
  }

  private async storeSummary(storeId: string, role: Role) {
    const store = await this.stores.findById(storeId);
    return { id: storeId, name: store?.name ?? storeId, role };
  }

  // ── Google OAuth2 ─────────────────────────────────────────────────────

  async validateGoogleUser(profile: {
    googleId: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
  }) {
    let user = await this.users.findByGoogleId(profile.googleId);
    if (user) return user;

    user = await this.users.findByEmail(profile.email);
    if (user) {
      // Link existing (password-based) account to this Google identity.
      await this.users.linkGoogleId(user.id, profile.googleId);
      return this.users.findById(user.id);
    }

    const created = await this.users.create({
      email: profile.email,
      fullName: profile.fullName,
      googleId: profile.googleId,
      emailVerifiedAt: new Date(), // Google already verified it
    });
    const store = await this.stores.create({
      name: `${profile.fullName}'s Store`,
    });
    await this.memberships.create(store.id, created.id, 'owner');
    return created;
  }

  // ── Refresh / logout ──────────────────────────────────────────────────

  async refresh(presentedToken: string) {
    const { token, userId, storeId } =
      await this.refreshTokens.rotate(presentedToken);
    const membership = await this.memberships.findOne(storeId, userId);
    if (!membership) {
      throw new UnauthorizedException('Membership no longer exists');
    }
    const accessToken = await this.tokens.signAccessToken({
      userId,
      storeId,
      role: membership.role as Role,
    });
    return { accessToken, refreshToken: token };
  }

  async logout(refreshToken: string) {
    await this.refreshTokens.revoke(refreshToken);
  }

  // ── Profile ───────────────────────────────────────────────────────────

  async me(userId: string): Promise<StaffMeResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    const memberships = await this.memberships.findAllForUser(userId);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      totpEnabled: user.totpEnabled,
      stores: memberships.map((m) => ({
        id: m.storeId,
        name: m.store?.name ?? m.storeId,
        role: m.role,
      })),
    };
  }

  // ── 2FA ───────────────────────────────────────────────────────────────

  async setup2fa(userId: string): Promise<StaffSetup2faResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    const secret = this.totp.generateSecret();
    await this.users.setTotpSecret(userId, secret);
    const uri = this.totp.keyUri(user.email, secret);
    const qrCode = await this.totp.qrCodeDataUrl(uri);
    return { secret, otpauthUri: uri, qrCode };
  }

  async enable2fa(userId: string, code: string) {
    const user = await this.users.findByIdWithSecrets(userId);
    if (!user?.totpSecret) {
      throw new BadRequestException('Call POST /auth/2fa/setup first');
    }
    if (!(await this.totp.verify(code, user.totpSecret))) {
      throw new UnauthorizedException('Invalid authentication code');
    }
    await this.users.setTotpEnabled(userId, true);
    return { totpEnabled: true };
  }

  async disable2fa(userId: string, code: string) {
    const user = await this.users.findByIdWithSecrets(userId);
    if (!user?.totpSecret || !user.totpEnabled) {
      throw new BadRequestException('2FA is not currently enabled');
    }
    if (!(await this.totp.verify(code, user.totpSecret))) {
      throw new UnauthorizedException('Invalid authentication code');
    }
    await this.users.setTotpEnabled(userId, false);
    await this.users.setTotpSecret(userId, null);
    return { totpEnabled: false };
  }

  // ── Password reset ────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.users.findByEmail(email);
    // Always behave the same way to avoid leaking which emails are registered.
    if (user) {
      const rawToken = randomBytes(32).toString('hex');
      await this.redis.set(
        `pwreset:${hashOpaqueToken(rawToken)}`,
        user.id,
        'PX',
        PASSWORD_RESET_TTL_MS,
      );
      await this.mail.sendPasswordReset(email, rawToken);
    }
    return { ok: true };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const key = `pwreset:${hashOpaqueToken(rawToken)}`;
    const userId = await this.redis.get(key);
    if (!userId) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.users.setPasswordHash(userId, passwordHash);
    await this.redis.del(key);
    return { ok: true };
  }

  // ── Invitations ───────────────────────────────────────────────────────

  async createInvitation(
    storeId: string,
    invitedBy: string,
    email: string,
    role: Role,
  ) {
    const store = await this.stores.findById(storeId);
    const inviter = await this.users.findById(invitedBy);
    if (!store || !inviter) throw new BadRequestException('Invalid store or inviter');

    const { invitation, rawToken } = await this.invitations.create(
      storeId,
      email,
      role,
      invitedBy,
    );
    await this.mail.sendInvitation(email, store.name, inviter.fullName, rawToken);
    return { id: invitation.id, email: invitation.email, role: invitation.role };
  }

  async acceptInvitation(dto: AcceptInvitationDto): Promise<LoginOutcome> {
    const invitation = await this.invitations.findValidByToken(dto.token);

    let user = await this.users.findByEmail(invitation.email);
    if (!user) {
      if (!dto.fullName || !dto.password) {
        throw new BadRequestException(
          'fullName and password are required to create a new account',
        );
      }
      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      user = await this.users.create({
        email: invitation.email,
        fullName: dto.fullName,
        passwordHash,
      });
    }

    const existingMembership = await this.memberships.findOne(
      invitation.storeId,
      user.id,
    );
    if (!existingMembership) {
      await this.memberships.create(invitation.storeId, user.id, invitation.role);
    }
    await this.invitations.markAccepted(invitation.id);

    return this.resolveStoreAndIssue(user, invitation.storeId);
  }

  async setupStore(dto: SetupStoreDto): Promise<LoginOutcome> {
    const payload = await this.tokens.verifySetupChallenge(dto.setupToken);
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 1. Update user profile
    await this.users.updateProfile(user.id, {
      fullName: dto.fullName,
      countryCode: dto.countryCode || null,
      language: dto.language || null,
    });

    // Resolve fullName in user object so resolveStoreAndIssue has access to updated name
    user.fullName = dto.fullName;

    // 2. Create store
    const store = await this.stores.create({
      name: dto.storeName,
      defaultCurrency: dto.defaultCurrency || 'USD',
      countryCode: dto.countryCode || null,
      organizationName: dto.organizationName || null,
      category: dto.category || null,
    });

    // 3. Create membership as owner
    await this.memberships.create(store.id, user.id, 'owner');

    // 4. Issue session
    await this.users.touchLastLogin(user.id);
    return this.issueSession(
      user.id,
      user.email,
      dto.fullName,
      store.id,
      'owner',
      store.name,
    );
  }
}
