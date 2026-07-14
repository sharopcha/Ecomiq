import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PaginatedResult, TenantScopedCrudService, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { ProductReview, ReviewStatus } from '../entities/product-review.entity';
import { ReviewRequest } from '../entities/review-request.entity';
import { CRM_REVIEW_AGGREGATE_TYPE, ReviewEventType } from '../events/crm-event-types';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';

@Injectable()
export class ReviewsService extends TenantScopedCrudService<ProductReview> {
  protected readonly alias = 'review';

  constructor(@InjectRepository(ProductReview) repo: Repository<ProductReview>) {
    super(repo);
  }

  private toEventPayload(review: ProductReview): Record<string, unknown> {
    return {
      id: review.id,
      storeId: review.storeId,
      productId: review.productId ?? null,
      customerId: review.customerId ?? null,
      rating: review.rating,
      status: review.status,
    };
  }

  async create(storeId: string, dto: CreateReviewDto): Promise<ProductReview> {
    return this.repo.manager.transaction(async (manager) => {
      const review = manager.create(ProductReview, {
        storeId,
        productId: dto.productId,
        customerId: dto.customerId,
        orderId: dto.orderId ?? null,
        rating: dto.rating,
        title: dto.title ?? null,
        body: dto.body ?? null,
        mediaFileIds: dto.mediaFileIds ?? null,
      });
      const saved = await manager.save(review);

      // Link an open (unlinked) review_request matching this order+customer,
      // if one exists — no reverse-lookup precedent elsewhere in this repo,
      // fresh pattern: the review request just stops being "open" once a
      // review shows up for the same (order, customer) pair.
      if (dto.orderId) {
        const openRequest = await manager.findOne(ReviewRequest, {
          where: { storeId, orderId: dto.orderId, customerId: dto.customerId, reviewId: IsNull() },
        });
        if (openRequest) {
          openRequest.reviewId = saved.id;
          await manager.save(openRequest);
        }
      }

      await recordOutboxEvent(manager, {
        eventType: ReviewEventType.ReviewCreated,
        storeId,
        aggregateType: CRM_REVIEW_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  async findAll(storeId: string, query: ListReviewsQueryDto): Promise<PaginatedResult<ProductReview>> {
    const qb = this.repo
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.store_id = :storeId`, { storeId });

    if (query.status) {
      qb.andWhere(`${this.alias}.status = :status`, { status: query.status });
    }
    if (query.productId) {
      qb.andWhere(`${this.alias}.product_id = :productId`, { productId: query.productId });
    }
    if (query.rating) {
      qb.andWhere(`${this.alias}.rating = :rating`, { rating: query.rating });
    }

    return paginate(qb, this.alias, query);
  }

  /** `pending -> published` only — same inline per-method guard style as order-service's ReturnsService. */
  async publish(storeId: string, id: string): Promise<ProductReview> {
    return this.repo.manager.transaction(async (manager) => {
      const review = await this.findOne(storeId, id);
      if (review.status !== ReviewStatus.Pending) {
        throw new ConflictException(
          `Review ${id} can only be published from pending (current: ${review.status})`,
        );
      }
      review.status = ReviewStatus.Published;
      const saved = await manager.save(review);

      await recordOutboxEvent(manager, {
        eventType: ReviewEventType.ReviewPublished,
        storeId,
        aggregateType: CRM_REVIEW_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  /** `published -> archived` only — matches the linear pending -> published -> archived machine. */
  async archive(storeId: string, id: string): Promise<ProductReview> {
    return this.repo.manager.transaction(async (manager) => {
      const review = await this.findOne(storeId, id);
      if (review.status !== ReviewStatus.Published) {
        throw new ConflictException(
          `Review ${id} can only be archived from published (current: ${review.status})`,
        );
      }
      review.status = ReviewStatus.Archived;
      const saved = await manager.save(review);

      await recordOutboxEvent(manager, {
        eventType: ReviewEventType.ReviewArchived,
        storeId,
        aggregateType: CRM_REVIEW_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }
}
