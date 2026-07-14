import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommentVisibility, OrderComment } from '../entities/order-comment.entity';

/**
 * Generic across `subjectTable` on purpose — `OrderComment` (Postgres table
 * `comment`) is polymorphic by design (see its own doc comment: RMA
 * timeline, refund activity, order comments all read the same table). This
 * class doesn't hard-code `subjectTable = 'order'`; `OrderCommentsController`
 * is today's only caller, passing `'order'` explicitly, so the
 * `return_request`/`refund` comment threads can reuse this unchanged
 * instead of a copy-pasted service per subject type.
 */
@Injectable()
export class OrderCommentsService {
  constructor(@InjectRepository(OrderComment) private readonly repo: Repository<OrderComment>) {}

  async create(
    storeId: string,
    subjectTable: string,
    subjectId: string,
    input: { body: string; visibility?: CommentVisibility; attachmentFileIds?: string[]; authorId?: string | null },
  ): Promise<OrderComment> {
    const comment = this.repo.create({
      storeId,
      subjectTable,
      subjectId,
      authorId: input.authorId ?? null,
      body: input.body,
      visibility: input.visibility ?? CommentVisibility.StaffOnly,
      attachmentFileIds: input.attachmentFileIds ?? null,
    });
    return this.repo.save(comment);
  }

  async list(storeId: string, subjectTable: string, subjectId: string): Promise<OrderComment[]> {
    return this.repo.find({
      where: { storeId, subjectTable, subjectId },
      order: { createdAt: 'ASC' },
    });
  }
}
