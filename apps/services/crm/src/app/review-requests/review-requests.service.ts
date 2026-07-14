import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent, topicForCommands } from '@temp-nx/pulsar';
import { ReviewRequest } from '../entities/review-request.entity';
import { Customer } from '../entities/customer.entity';
import { CreateReviewRequestDto } from './dto/create-review-request.dto';

/** Duplicated per-service by design — every producer of `notify.send` declares its own copy (refund's precedent). */
const NOTIFY_SEND_COMMAND = 'notify.send';
const REVIEW_REQUEST_AGGREGATE_TYPE = 'review_request';

@Injectable()
export class ReviewRequestsService {
  constructor(
    @InjectRepository(ReviewRequest) private readonly repo: Repository<ReviewRequest>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    private readonly config: ConfigService,
  ) {}

  async findAll(storeId: string, query: PaginationQueryDto): Promise<PaginatedResult<ReviewRequest>> {
    const qb = this.repo.createQueryBuilder('review_request').where('review_request.store_id = :storeId', {
      storeId,
    });
    return paginate(qb, 'review_request', query);
  }

  async create(storeId: string, dto: CreateReviewRequestDto): Promise<ReviewRequest> {
    const customer = await this.customerRepo.findOne({ where: { id: dto.customerId, storeId } });
    if (!customer) {
      throw new NotFoundException(`Customer ${dto.customerId} not found`);
    }

    return this.repo.manager.transaction(async (manager) => {
      const request = manager.create(ReviewRequest, {
        storeId,
        orderId: dto.orderId,
        customerId: dto.customerId,
        sentAt: new Date(),
      });
      const saved = await manager.save(request);

      // notify.send template `review_request` — vars {{Customer_name}}/
      // {{Order_ID}}/{{Store_name}} per the template body; notification's
      // mapper doesn't fill Customer_name/Store_name into `vars` from a
      // payload today (a pre-existing gap in its notify.send mapper, not
      // unique to this command), but the raw fields are included here so
      // that mapper has something to build from once it learns this
      // template.
      await recordOutboxEvent(manager, {
        eventType: NOTIFY_SEND_COMMAND,
        storeId,
        aggregateType: REVIEW_REQUEST_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          template: 'review_request',
          orderId: dto.orderId,
          customerId: dto.customerId,
          customerName: customer.fullName,
          email: customer.email ?? null,
        },
        topic: topicForCommands(this.config.get<string>('PULSAR_TENANT', 'ecomiq'), 'marketing', 'notify'),
      });

      return saved;
    });
  }
}
