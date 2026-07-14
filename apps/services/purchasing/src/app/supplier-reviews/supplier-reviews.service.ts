import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Supplier } from '../entities/supplier.entity';
import { SupplierReview } from '../entities/supplier-review.entity';
import { assertSupplierOwned } from '../suppliers/supplier-ownership.util';
import { CreateSupplierReviewDto } from './dto/create-supplier-review.dto';

/** Rounds to numeric(2,1)'s one-decimal precision (`rating_avg` column). */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

@Injectable()
export class SupplierReviewsService {
  constructor(
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(SupplierReview) private readonly reviewRepo: Repository<SupplierReview>,
  ) {}

  /**
   * Recomputes `rating_avg`/`rating_count` from a fresh `AVG`/`COUNT` over
   * every `supplier_review` row — not the incremental running-average math
   * catalog-service's cross-DB `CatalogSyncService` uses. That incremental
   * approach exists there *because* the review event payload only carries
   * the single new/removed rating, not access to every other review — a
   * cross-DB consumer can't just `SELECT AVG(...)` on crm's table. Here,
   * supplier and supplier_review live in the same purchasing_db, so a plain
   * aggregate query is both simpler and immune to incremental-math drift.
   */
  private async recomputeRating(manager: EntityManager, storeId: string, supplierId: string): Promise<void> {
    const { avg, count } = await manager
      .createQueryBuilder(SupplierReview, 'review')
      .select('AVG(review.rating)', 'avg')
      .addSelect('COUNT(review.id)', 'count')
      .where('review.supplier_id = :supplierId', { supplierId })
      .getRawOne<{ avg: string | null; count: string }>();

    const ratingCount = Number(count);
    await manager.update(
      Supplier,
      { id: supplierId, storeId },
      { ratingAvg: ratingCount === 0 ? null : round1(Number(avg)), ratingCount },
    );
  }

  async findAll(storeId: string, supplierId: string): Promise<SupplierReview[]> {
    await assertSupplierOwned(this.supplierRepo, storeId, supplierId);
    return this.reviewRepo.find({ where: { supplierId }, order: { createdAt: 'DESC' } });
  }

  async create(
    storeId: string,
    supplierId: string,
    dto: CreateSupplierReviewDto,
  ): Promise<SupplierReview> {
    await assertSupplierOwned(this.supplierRepo, storeId, supplierId);
    return this.supplierRepo.manager.transaction(async (manager) => {
      const review = manager.create(SupplierReview, {
        storeId,
        supplierId,
        authorName: dto.authorName ?? null,
        rating: dto.rating,
        title: dto.title ?? null,
        body: dto.body ?? null,
      });
      const saved = await manager.save(review);
      await this.recomputeRating(manager, storeId, supplierId);
      return saved;
    });
  }

  async remove(storeId: string, supplierId: string, reviewId: string): Promise<void> {
    await assertSupplierOwned(this.supplierRepo, storeId, supplierId);
    await this.supplierRepo.manager.transaction(async (manager) => {
      await manager.delete(SupplierReview, { id: reviewId, supplierId });
      await this.recomputeRating(manager, storeId, supplierId);
    });
  }
}
