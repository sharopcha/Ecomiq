import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { EntityManager, Repository } from 'typeorm';
import { recordOutboxEvent, topicForCommands } from '@temp-nx/pulsar';
import { Customer } from '../entities/customer.entity';
import { Referral } from '../entities/referral.entity';
import { claimNextSequenceNumber } from '../common/store-sequence.util';
import { writeActivityLog } from '../common/activity-log.util';
import { CRM_CUSTOMER_AGGREGATE_TYPE, CustomerEventType } from '../events/crm-event-types';
import { TokenService } from './token.service';
import { RefreshTokenService } from './refresh-token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;
const CUSTOMER_SEQUENCE_KIND = 'customer';
const SUBJECT_TABLE = 'customer';
const NOTIFY_SEND_COMMAND = 'notify.send';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly config: ConfigService,
  ) {}

  private async issueSession(customer: Customer): Promise<AuthSession> {
    const accessToken = await this.tokens.signAccessToken({ customerId: customer.id, storeId: customer.storeId });
    const refreshToken = await this.refreshTokens.issue(customer.id, customer.storeId);
    return { accessToken, refreshToken };
  }

  async register(storeId: string, dto: RegisterDto): Promise<AuthSession> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const customer = await this.customerRepo.manager.transaction(async (manager) => {
      const existing = await manager.findOne(Customer, { where: { storeId, email: dto.email } });
      if (existing) {
        if (existing.passwordHash) {
          throw new ConflictException('An account with this email already exists');
        }
        // Admin-created/imported customer with no password yet — registering
        // claims that existing row rather than creating a duplicate.
        existing.passwordHash = passwordHash;
        existing.registeredAt = new Date();
        existing.fullName = dto.fullName;
        const saved = await manager.save(existing);
        await this.afterRegister(manager, saved, dto);
        return saved;
      }

      const seq = await claimNextSequenceNumber(manager, storeId, CUSTOMER_SEQUENCE_KIND);
      const created = manager.create(Customer, {
        storeId,
        displayId: `CST-${seq}`,
        fullName: dto.fullName,
        email: dto.email,
        passwordHash,
        registeredAt: new Date(),
        totalSpentMinor: 0,
      });
      const saved = await manager.save(created);
      await this.afterRegister(manager, saved, dto);
      return saved;
    });

    return this.issueSession(customer);
  }

  private async afterRegister(manager: EntityManager, customer: Customer, dto: RegisterDto): Promise<void> {
    await writeActivityLog(manager, {
      storeId: customer.storeId,
      subjectTable: SUBJECT_TABLE,
      subjectId: customer.id,
      verb: 'customer.registered',
      data: { displayId: customer.displayId },
    });

    await recordOutboxEvent(manager, {
      eventType: CustomerEventType.CustomerRegistered,
      storeId: customer.storeId,
      aggregateType: CRM_CUSTOMER_AGGREGATE_TYPE,
      aggregateId: customer.id,
      payload: {
        id: customer.id,
        storeId: customer.storeId,
        displayId: customer.displayId,
        fullName: customer.fullName,
        email: customer.email ?? null,
      },
    });

    await recordOutboxEvent(manager, {
      eventType: NOTIFY_SEND_COMMAND,
      storeId: customer.storeId,
      aggregateType: CRM_CUSTOMER_AGGREGATE_TYPE,
      aggregateId: customer.id,
      payload: {
        template: 'welcome',
        customerId: customer.id,
        customerName: customer.fullName,
        email: customer.email ?? null,
      },
      topic: topicForCommands(this.config.get<string>('PULSAR_TENANT', 'ecomiq'), 'marketing', 'notify'),
    });

    if (dto.referralCode) {
      const referrer = await manager.findOne(Customer, {
        where: { storeId: customer.storeId, referralCode: dto.referralCode },
      });
      await manager.save(
        Referral,
        manager.create(Referral, {
          storeId: customer.storeId,
          referrerId: referrer?.id ?? null,
          refereeId: customer.id,
          code: dto.referralCode,
        }),
      );
    }
  }

  async login(storeId: string, dto: LoginDto): Promise<AuthSession> {
    const customer = await this.customerRepo.findOne({ where: { storeId, email: dto.email } });
    if (!customer || !customer.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(dto.password, customer.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueSession(customer);
  }

  async refresh(presentedToken: string): Promise<AuthSession> {
    const { token, customerId, storeId } = await this.refreshTokens.rotate(presentedToken);
    const customer = await this.customerRepo.findOne({ where: { id: customerId, storeId } });
    if (!customer) {
      throw new UnauthorizedException('Customer no longer exists');
    }
    const accessToken = await this.tokens.signAccessToken({ customerId: customer.id, storeId: customer.storeId });
    return { accessToken, refreshToken: token };
  }

  async logout(presentedToken: string): Promise<void> {
    await this.refreshTokens.revoke(presentedToken);
  }
}
