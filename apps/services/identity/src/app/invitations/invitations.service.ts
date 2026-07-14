import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { Invitation } from '../entities/invitation.entity';
import { Role } from '@temp-nx/auth';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation)
    private readonly repo: Repository<Invitation>,
  ) {}

  /** Returns the raw token — only shown/emailed once, never persisted. */
  async create(
    storeId: string,
    email: string,
    role: Role,
    invitedBy: string,
  ): Promise<{ invitation: Invitation; rawToken: string }> {
    const existing = await this.repo.findOne({
      where: { storeId, email, status: 'pending' },
    });
    if (existing) {
      throw new ConflictException(
        'An invitation is already pending for this email',
      );
    }

    const rawToken = randomBytes(32).toString('hex');
    const invitation = this.repo.create({
      storeId,
      email,
      role,
      invitedBy,
      tokenHash: hashToken(rawToken),
      status: 'pending',
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });
    await this.repo.save(invitation);
    return { invitation, rawToken };
  }

  async findValidByToken(rawToken: string): Promise<Invitation> {
    const invitation = await this.repo.findOne({
      where: { tokenHash: hashToken(rawToken) },
      relations: { store: true },
    });
    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundException('Invitation not found or already used');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.repo.update({ id: invitation.id }, { status: 'expired' });
      throw new BadRequestException('Invitation has expired');
    }
    return invitation;
  }

  async markAccepted(id: string) {
    await this.repo.update(
      { id },
      { status: 'accepted', acceptedAt: new Date() },
    );
  }

  listForStore(storeId: string) {
    return this.repo.find({
      where: { storeId },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(storeId: string, id: string) {
    await this.repo.update({ id, storeId }, { status: 'revoked' });
  }
}
