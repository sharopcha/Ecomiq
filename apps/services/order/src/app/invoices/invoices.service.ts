import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { Invoice } from '../entities/invoice.entity';
import { writeActivityLog } from '../common/activity-log.util';
import { claimNextSequenceNumber } from '../common/store-sequence.util';
import { OrdersService } from '../orders/orders.service';

const INVOICE_SEQUENCE_KIND = 'invoice';
const SUBJECT_TABLE = 'order';

/**
 * `POST /api/orders/:id/invoice` — snapshots the order's totals into an
 * immutable `Invoice` row (see that
 * entity's doc comment for why it's a jsonb copy, not a live reference).
 * `displayId` claims its own `store_sequence` counter (kind `'invoice'`),
 * same claim mechanism `OrdersService.create` uses for `displayNumber`
 * (kind `'order'`) — see `store-sequence.util.ts`.
 */
@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice) private readonly repo: Repository<Invoice>,
    private readonly orders: OrdersService,
  ) {}

  async createForOrder(storeId: string, orderId: string): Promise<Invoice> {
    return this.repo.manager.transaction(async (manager) => {
      const order = await this.orders.findOneWithManager(manager, storeId, orderId);
      const seq = await claimNextSequenceNumber(manager, storeId, INVOICE_SEQUENCE_KIND);

      const invoice = manager.create(Invoice, {
        storeId,
        order,
        displayId: `INV-${seq}`,
        issuedAt: new Date(),
        totals: this.toTotalsSnapshot(order),
      });
      const saved = await manager.save(invoice);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: order.id,
        verb: 'order.invoice_issued',
        data: { invoiceId: saved.id, displayId: saved.displayId },
      });

      return saved;
    });
  }

  private toTotalsSnapshot(order: Order): Record<string, unknown> {
    return {
      subtotalMinor: order.subtotalMinor,
      shippingFeeMinor: order.shippingFeeMinor,
      discountMinor: order.discountMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      currency: order.currency,
    };
  }
}
