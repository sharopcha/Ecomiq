import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { EntityManager, Repository } from 'typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Supplier } from '../entities/supplier.entity';
import { writeActivityLog } from '../common/activity-log.util';
import { PURCHASING_SUPPLIER_AGGREGATE_TYPE, SupplierEventType } from '../events/purchasing-event-types';
import { TokenService } from './token.service';
import { RefreshTokenService } from './refresh-token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;
const SUBJECT_TABLE = 'supplier';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
}

/**
 * Supplier-portal auth core (Step 11) — third JWT principal alongside staff
 * and customer, crm's customer-auth stack (`AuthService`/`TokenService`/
 * `RefreshTokenService`/`KeyService`) is the direct precedent, copied
 * file-for-file with `aud: 'supplier'` in place of `aud: 'customer'`.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  private async issueSession(supplier: Supplier): Promise<AuthSession> {
    const accessToken = await this.tokens.signAccessToken({ supplierId: supplier.id, storeId: supplier.storeId });
    const refreshToken = await this.refreshTokens.issue(supplier.id, supplier.storeId);
    return { accessToken, refreshToken };
  }

  /**
   * Register-claims-by-email, not create — a supplier row must already
   * exist (admin-created via `POST /suppliers`, Step 3) before its owner
   * can register a portal login. No self-serve supplier creation, unlike
   * crm's customer register (which does have a create-new fallback path).
   */
  async register(storeId: string, dto: RegisterDto): Promise<AuthSession> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const supplier = await this.supplierRepo.manager.transaction(async (manager) => {
      const existing = await manager.findOne(Supplier, { where: { storeId, email: dto.email } });
      if (!existing) {
        throw new NotFoundException(
          'No supplier account found for this email — ask the merchant to add you as a supplier first',
        );
      }
      if (existing.passwordHash) {
        throw new ConflictException('This supplier has already registered');
      }
      existing.passwordHash = passwordHash;
      existing.registeredAt = new Date();
      const saved = await manager.save(existing);
      await this.afterRegister(manager, saved);
      return saved;
    });

    return this.issueSession(supplier);
  }

  private async afterRegister(manager: EntityManager, supplier: Supplier): Promise<void> {
    await writeActivityLog(manager, {
      storeId: supplier.storeId,
      subjectTable: SUBJECT_TABLE,
      subjectId: supplier.id,
      verb: 'supplier.registered',
      data: { displayId: supplier.displayId },
    });

    await recordOutboxEvent(manager, {
      eventType: SupplierEventType.SupplierRegistered,
      storeId: supplier.storeId,
      aggregateType: PURCHASING_SUPPLIER_AGGREGATE_TYPE,
      aggregateId: supplier.id,
      payload: {
        id: supplier.id,
        storeId: supplier.storeId,
        displayId: supplier.displayId,
        name: supplier.name,
        email: supplier.email ?? null,
      },
    });
  }

  /** Stamps `last_logged_in_at` — resolves the data model's `[GAP]` comment on that column. */
  async login(storeId: string, dto: LoginDto): Promise<AuthSession> {
    const supplier = await this.supplierRepo.findOne({ where: { storeId, email: dto.email } });
    if (!supplier || !supplier.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(dto.password, supplier.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    supplier.lastLoggedInAt = new Date();
    await this.supplierRepo.save(supplier);
    return this.issueSession(supplier);
  }

  async refresh(presentedToken: string): Promise<AuthSession> {
    const { token, supplierId, storeId } = await this.refreshTokens.rotate(presentedToken);
    const supplier = await this.supplierRepo.findOne({ where: { id: supplierId, storeId } });
    if (!supplier) {
      throw new UnauthorizedException('Supplier no longer exists');
    }
    const accessToken = await this.tokens.signAccessToken({ supplierId: supplier.id, storeId: supplier.storeId });
    return { accessToken, refreshToken: token };
  }

  async logout(presentedToken: string): Promise<void> {
    await this.refreshTokens.revoke(presentedToken);
  }
}
