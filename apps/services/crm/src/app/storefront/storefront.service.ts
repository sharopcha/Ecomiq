import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PaginationQueryDto, paginate } from '@temp-nx/typeorm';
import { Customer } from '../entities/customer.entity';
import { ReviewRequest } from '../entities/review-request.entity';
import { ProductReview } from '../entities/product-review.entity';
import { ReviewsService } from '../reviews/reviews.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { UpdateStorefrontProfileDto } from './dto/update-profile.dto';
import { CreateStorefrontReviewDto } from './dto/create-storefront-review.dto';
import type { ProductReviewDto } from '@temp-nx/api-types/catalog';
import type { CursorPaginatedResponse } from '@temp-nx/api-types';
import type { CustomerProfileDto, LoyaltyStatusDto } from '@temp-nx/api-types/crm';

// A plain data shape, not `Omit<Customer, 'passwordHash'>` — destructuring
// an entity instance drops its prototype methods (`generateId()` from
// `BaseEntity`), so the result can never structurally satisfy the class type.
export type StorefrontProfile = Pick<
  Customer,
  | 'id'
  | 'storeId'
  | 'displayId'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'avatarFileId'
  | 'source'
  | 'status'
  | 'totalOrders'
  | 'totalSpentMinor'
  | 'lastOnlineAt'
  | 'registeredAt'
  | 'referralCode'
  | 'createdAt'
  | 'updatedAt'
>;

@Injectable()
export class StorefrontService {
  constructor(
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(ReviewRequest) private readonly reviewRequestRepo: Repository<ReviewRequest>,
    private readonly reviews: ReviewsService,
    private readonly loyalty: LoyaltyService,
  ) {}

  private toProfile(customer: Customer): StorefrontProfile {
    const { passwordHash: _passwordHash, ...profile } = customer;
    return profile;
  }

  /**
   * Own profile + rollups (`total_orders`/`total_spent_minor`/`last_online_at`
   * already live on `Customer`, no separate query needed) + a loyalty
   * summary (`null` until the customer's first accrual creates an
   * account — no account means no loyalty activity yet, not an error).
   */
  async getProfile(customerId: string, storeId: string): Promise<CustomerProfileDto> {
    const customer = await this.customerRepo.findOne({ where: { id: customerId, storeId } });
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }
    const account = await this.loyalty.getAccount(storeId, customerId);
    return {
      // Serialized to ISO strings at the HTTP boundary by Nest's JSON serializer.
      ...(this.toProfile(customer) as unknown as CustomerProfileDto),
      loyalty: account ? { points: account.points, tier: account.tier } : null,
    };
  }

  async updateProfile(
    customerId: string,
    storeId: string,
    dto: UpdateStorefrontProfileDto,
  ): Promise<CustomerProfileDto> {
    const customer = await this.customerRepo.findOne({ where: { id: customerId, storeId } });
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }
    this.customerRepo.merge(customer, dto);
    const saved = await this.customerRepo.save(customer);
    return this.toProfile(saved) as unknown as CustomerProfileDto;
  }

  /**
   * Gated on an open (unlinked) `review_request` for the same
   * (customerId, orderId) — the "or a placed order containing the
   * product" alternative from the plan isn't checkable today: crm-service
   * doesn't sync order line items anywhere, only order-level rollups, so
   * there's no local record of which products a given order actually
   * contained. Flagged here rather than faking the check.
   */
  async createReview(customerId: string, storeId: string, dto: CreateStorefrontReviewDto) {
    const openRequest = await this.reviewRequestRepo.findOne({
      where: { storeId, customerId, orderId: dto.orderId, reviewId: IsNull() },
    });
    if (!openRequest) {
      throw new ForbiddenException(
        `No open review request found for order ${dto.orderId} — cannot post a review for it`,
      );
    }

    return this.reviews.create(storeId, {
      productId: dto.productId,
      customerId,
      orderId: dto.orderId,
      rating: dto.rating,
      title: dto.title,
      body: dto.body,
      mediaFileIds: dto.mediaFileIds,
    });
  }

  async getLoyalty(customerId: string, storeId: string, query: PaginationQueryDto): Promise<LoyaltyStatusDto> {
    const [account, history] = await Promise.all([
      this.loyalty.getAccount(storeId, customerId),
      this.loyalty.listTxns(storeId, customerId, query),
    ]);
    return {
      points: account?.points ?? 0,
      tier: account?.tier ?? null,
      // Serialized to ISO strings at the HTTP boundary by Nest's JSON serializer.
      history: history as unknown as LoyaltyStatusDto['history'],
    };
  }

  async getPublicReviewsForProduct(
    productId: string,
    query: PaginationQueryDto,
  ): Promise<CursorPaginatedResponse<ProductReviewDto>> {
    const qb = this.customerRepo.manager.createQueryBuilder(ProductReview, 'review')
      .leftJoinAndSelect('review.customer', 'customer')
      .where('review.product_id = :productId', { productId })
      .andWhere('review.status = :status', { status: 'published' })
      .select([
        'review.id',
        'review.rating',
        'review.title',
        'review.body',
        'review.createdAt',
        'customer.id', // Keep ID so frontend can key it if needed
        'customer.fullName' // Using full name as display name
      ]);

    return paginate(qb, 'review', query) as unknown as Promise<CursorPaginatedResponse<ProductReviewDto>>;
  }
}
