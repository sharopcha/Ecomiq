import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { claimEventForHandler } from './processed-event.util';
import { ReviewEventPayload } from './review-event-payload';

const PUBLISHED_HANDLER = 'review_published_rating_rollup';
const ARCHIVED_HANDLER = 'review_archived_rating_rollup';

/** Rounds to numeric(2,1)'s one-decimal precision (`rating_avg` column). */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);

  constructor(@InjectRepository(Product) private readonly productRepo: Repository<Product>) {}

  /** `crm.review.published` -> recompute rating_avg/increment rating_count. */
  async applyReviewPublished(storeId: string, eventId: string, payload: ReviewEventPayload): Promise<void> {
    if (!payload.productId) {
      this.logger.log(`crm.review.published skipped (eventId=${eventId}): review ${payload.id} has no productId`);
      return;
    }

    await this.productRepo.manager.transaction(async (manager) => {
      const claimed = await claimEventForHandler(manager, eventId, PUBLISHED_HANDLER);
      if (!claimed) {
        this.logger.log(`crm.review.published already processed (eventId=${eventId}, handler=${PUBLISHED_HANDLER})`);
        return;
      }

      const product = await manager.findOne(Product, {
        where: { id: payload.productId as string, storeId },
      });
      if (!product) {
        this.logger.log(
          `crm.review.published skipped (eventId=${eventId}): product ${payload.productId} not found in store ${storeId}`,
        );
        return;
      }

      const previousCount = product.ratingCount;
      const previousAvg = product.ratingAvg == null ? 0 : Number(product.ratingAvg);
      const newCount = previousCount + 1;
      const newAvg = round1((previousAvg * previousCount + payload.rating) / newCount);

      product.ratingCount = newCount;
      product.ratingAvg = newAvg;
      await manager.save(product);
    });
  }

  /** `crm.review.archived` -> decrement rating_count/recompute rating_avg. */
  async applyReviewArchived(storeId: string, eventId: string, payload: ReviewEventPayload): Promise<void> {
    if (!payload.productId) {
      this.logger.log(`crm.review.archived skipped (eventId=${eventId}): review ${payload.id} has no productId`);
      return;
    }

    await this.productRepo.manager.transaction(async (manager) => {
      const claimed = await claimEventForHandler(manager, eventId, ARCHIVED_HANDLER);
      if (!claimed) {
        this.logger.log(`crm.review.archived already processed (eventId=${eventId}, handler=${ARCHIVED_HANDLER})`);
        return;
      }

      const product = await manager.findOne(Product, {
        where: { id: payload.productId as string, storeId },
      });
      if (!product) {
        this.logger.log(
          `crm.review.archived skipped (eventId=${eventId}): product ${payload.productId} not found in store ${storeId}`,
        );
        return;
      }

      const previousCount = product.ratingCount;
      const previousAvg = product.ratingAvg == null ? 0 : Number(product.ratingAvg);
      const newCount = Math.max(previousCount - 1, 0);
      const newAvg = newCount === 0 ? null : round1((previousAvg * previousCount - payload.rating) / newCount);

      product.ratingCount = newCount;
      product.ratingAvg = newAvg;
      await manager.save(product);
    });
  }
}
