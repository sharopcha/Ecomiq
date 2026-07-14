import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { WishlistItem } from '../entities/wishlist-item.entity';
import type { WishlistItemDto } from '@temp-nx/api-types/crm';

@Injectable()
export class WishlistService {
  constructor(@InjectRepository(WishlistItem) private readonly repo: Repository<WishlistItem>) {}

  async list(storeId: string, customerId: string): Promise<WishlistItemDto[]> {
    // Serialized to ISO strings at the HTTP boundary by Nest's JSON serializer.
    return this.repo.find({
      where: { storeId, customerId },
      order: { createdAt: 'ASC' },
    }) as unknown as Promise<WishlistItemDto[]>;
  }

  /**
   * `ON CONFLICT (customer_id, variant_id) DO NOTHING` — a duplicate add is
   * a true no-op at the DB level, not an application-level check-then-insert
   * race. Raw SQL rather than `repo.upsert()`/`.orIgnore()`: this repo
   * already hit a real bug (crm's Step 4 rollup consumer) where TypeORM's
   * insert-result APIs don't reliably distinguish "inserted" from "conflict
   * skipped" — irrelevant here since the caller doesn't need to know which
   * happened, but the raw-SQL shape is the one already proven correct.
   */
  async add(storeId: string, customerId: string, variantId: string): Promise<void> {
    await this.repo.manager.query(
      `INSERT INTO wishlist_item (id, store_id, customer_id, variant_id) VALUES ($1, $2, $3, $4) ON CONFLICT (customer_id, variant_id) DO NOTHING`,
      [ulid(), storeId, customerId, variantId],
    );
  }

  async remove(storeId: string, customerId: string, variantId: string): Promise<void> {
    await this.repo.delete({ storeId, customerId, variantId });
  }
}
