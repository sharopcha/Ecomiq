import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { FeedQueryDto } from './dto/feed-query.dto';
import type { NotificationFeedResponse } from '@temp-nx/api-types/notification';

export interface PushNotificationInput {
  userId?: string | null;
  kind: string;
  title?: string | null;
  body?: string | null;
  refTable?: string | null;
  refId?: string | null;
}

export interface FeedResult {
  items: Notification[];
  total: number;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
  ) {}

  /**
   * Creates one in-app notification row — `userId` omitted/null means a
   * store-wide broadcast, set means targeted at that one staff user.
   * Exported (via `NotificationsModule`) for Step 5's `InAppChannel`, which
   * calls this directly — in-app is the one channel with no external
   * provider, so there's nothing to put behind a port.
   */
  async push(storeId: string, input: PushNotificationInput): Promise<Notification> {
    const entity = this.repo.create({
      storeId,
      userId: input.userId ?? null,
      kind: input.kind,
      title: input.title ?? null,
      body: input.body ?? null,
      refTable: input.refTable ?? null,
      refId: input.refId ?? null,
      readAt: null,
    });
    return this.repo.save(entity);
  }

  /** Rows visible to this caller: their own targeted rows, plus every store-wide broadcast. */
  private visibleTo(storeId: string, userId: string) {
    return this.repo
      .createQueryBuilder('notification')
      .where('notification.store_id = :storeId', { storeId })
      .andWhere('(notification.user_id = :userId OR notification.user_id IS NULL)', { userId });
  }

  /** Own + broadcast rows, unread first, then newest first within each tier. */
  async findFeed(storeId: string, userId: string, query: FeedQueryDto): Promise<NotificationFeedResponse> {
    const [items, total] = await this.visibleTo(storeId, userId)
      .orderBy('notification.read_at IS NULL', 'DESC')
      .addOrderBy('notification.id', 'DESC')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();
    // Serialized to ISO strings at the HTTP boundary by Nest's JSON serializer.
    return { items: items as unknown as NotificationFeedResponse['items'], total };
  }

  async unreadCount(storeId: string, userId: string): Promise<number> {
    return this.visibleTo(storeId, userId).andWhere('notification.read_at IS NULL').getCount();
  }

  /**
   * Marks one row read — 404s if it doesn't exist or isn't visible to this
   * caller (same store, and either targeted at them or a broadcast), same
   * no-existence-leak reasoning as `assertOwnedByStore`. Idempotent:
   * marking an already-read row again is a no-op, not an error.
   *
   * `read_at` on a broadcast row (`userId: null`) is shared across every
   * staff user in the store — there's no per-user read-receipt table.
   * Deliberately deferred (not a gap this step tries to close): the first
   * staff member to read a broadcast marks it read for everyone else too.
   */
  async markRead(storeId: string, userId: string, id: string): Promise<Notification> {
    const entity = await this.visibleTo(storeId, userId)
      .andWhere('notification.id = :id', { id })
      .getOne();
    if (!entity) {
      throw new NotFoundException(`notification ${id} not found`);
    }
    if (!entity.readAt) {
      entity.readAt = new Date();
      await this.repo.save(entity);
    }
    return entity;
  }

  /** Marks every currently-visible unread row read in one shot (single UPDATE, not a per-row loop). */
  async markAllRead(storeId: string, userId: string): Promise<{ updated: number }> {
    const result = await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: () => 'now()' })
      .where('store_id = :storeId', { storeId })
      .andWhere('(user_id = :userId OR user_id IS NULL)', { userId })
      .andWhere('read_at IS NULL')
      .execute();
    return { updated: result.affected ?? 0 };
  }
}
