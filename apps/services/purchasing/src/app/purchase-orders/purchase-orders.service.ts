import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EntityManager, Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto, assertOwnedByStore, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent, topicForCommands } from '@temp-nx/pulsar';
import { Supplier } from '../entities/supplier.entity';
import { PurchaseOrder, PoStatus } from '../entities/purchase-order.entity';
import { PurchaseOrderLine } from '../entities/purchase-order-line.entity';
import { assertSupplierOwned } from '../suppliers/supplier-ownership.util';
import { claimNextSequenceNumber } from '../common/store-sequence.util';
import { PURCHASING_PO_AGGREGATE_TYPE, PoEventType } from '../events/purchasing-event-types';
import { computePoTotals } from './po-totals.util';
import { canTransitionPo } from './po-status.util';
import { applyReceipt } from './po-receive.util';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrderLineDto } from './dto/purchase-order-line.dto';
import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';

const PO_SEQUENCE_KIND = 'po';
const ALIAS = 'po';
/** Duplicated per-service by design — every producer of `notify.send` declares its own copy (crm's `review-requests.service.ts` precedent). */
const NOTIFY_SEND_COMMAND = 'notify.send';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(PurchaseOrder) private readonly repo: Repository<PurchaseOrder>,
    private readonly config: ConfigService,
  ) {}

  private toEventPayload(po: PurchaseOrder): Record<string, unknown> {
    return {
      id: po.id,
      storeId: po.storeId,
      displayId: po.displayId,
      supplierId: po.supplierId,
      status: po.status,
      totalMinor: po.totalMinor ?? null,
      // Step 10: distinguishes an AutoDraftPoService-created PO from a
      // merchant-created one for any future consumer — computed from
      // `sourceReorderRuleId` rather than stored as its own column, so the
      // two never drift apart.
      source: po.sourceReorderRuleId ? 'auto_reorder' : 'manual',
    };
  }

  /** Detail view — full relations (each line), unlike the list view's base findAll. Mirrors shipping's `LabelsService.findOne`. */
  async findOne(storeId: string, id: string): Promise<PurchaseOrder> {
    const po = await this.repo.findOne({ where: { id }, relations: { lines: true } });
    return assertOwnedByStore(po, storeId, () => new NotFoundException(`Purchase order ${id} not found`));
  }

  async findAll(storeId: string, query: ListPurchaseOrdersQueryDto): Promise<PaginatedResult<PurchaseOrder>> {
    const qb = this.repo.createQueryBuilder(ALIAS).where(`${ALIAS}.store_id = :storeId`, { storeId });

    if (query.status) {
      qb.andWhere(`${ALIAS}.status = :status`, { status: query.status });
    }
    if (query.supplierId) {
      qb.andWhere(`${ALIAS}.supplier_id = :supplierId`, { supplierId: query.supplierId });
    }

    return paginate(qb, ALIAS, query);
  }

  /**
   * `GET /portal/pos` (Step 12) — a supplier's own POs, `sent` and beyond
   * only. Never `draft` — a supplier has no business seeing a PO the
   * merchant hasn't sent them yet, unlike the admin `findAll` above (which
   * takes an arbitrary single-status filter and has no such floor).
   */
  async findMineForPortal(
    storeId: string,
    supplierId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<PurchaseOrder>> {
    const qb = this.repo
      .createQueryBuilder(ALIAS)
      .where(`${ALIAS}.store_id = :storeId AND ${ALIAS}.supplier_id = :supplierId`, { storeId, supplierId })
      .andWhere(`${ALIAS}.status != :draft`, { draft: PoStatus.Draft });

    return paginate(qb, ALIAS, query);
  }

  /**
   * `sourceReorderRuleId` is not part of `CreatePurchaseOrderDto` — it's not
   * a client-settable field (same treatment as the server-computed totals),
   * only ever passed by `AutoDraftPoService` (Step 10). Left `null` (the
   * default), this is exactly the wizard's regular draft-creation path.
   */
  async create(
    storeId: string,
    dto: CreatePurchaseOrderDto,
    sourceReorderRuleId: string | null = null,
  ): Promise<PurchaseOrder> {
    await assertSupplierOwned(this.supplierRepo, storeId, dto.supplierId);
    const { subtotalMinor, totalMinor } = computePoTotals(dto.lines, dto.taxRate);

    return this.repo.manager.transaction(async (manager) => {
      const seq = await claimNextSequenceNumber(manager, storeId, PO_SEQUENCE_KIND);

      const po = manager.create(PurchaseOrder, {
        storeId,
        displayId: `PO-${seq}`,
        supplierId: dto.supplierId,
        expectedDeliveryDate: dto.expectedDeliveryDate ?? null,
        assignedTo: dto.assignedTo ?? null,
        paymentTerms: dto.paymentTerms,
        deliverToLocationId: dto.deliverToLocationId ?? null,
        carrier: dto.carrier ?? null,
        note: dto.note ?? null,
        subtotalMinor,
        taxRate: dto.taxRate ?? null,
        totalMinor,
        emailTo: dto.emailTo ?? null,
        emailSubject: dto.emailSubject ?? null,
        emailBody: dto.emailBody ?? null,
        sourceReorderRuleId,
      });
      const saved = await manager.save(po);
      saved.lines = await manager.save(this.buildLineRows(manager, saved, dto.lines));

      await recordOutboxEvent(manager, {
        eventType: PoEventType.PoCreated,
        storeId,
        aggregateType: PURCHASING_PO_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  /** Only legal while `draft` — the wizard's create/update step, not a lifecycle transition. */
  async update(storeId: string, id: string, dto: UpdatePurchaseOrderDto): Promise<PurchaseOrder> {
    const po = await this.findOne(storeId, id);
    if (po.status !== PoStatus.Draft) {
      throw new ConflictException(`Purchase order ${id} can only be updated while draft (current: ${po.status})`);
    }
    if (dto.supplierId && dto.supplierId !== po.supplierId) {
      await assertSupplierOwned(this.supplierRepo, storeId, dto.supplierId);
    }

    const { lines, ...rest } = dto;
    Object.assign(po, rest);

    return this.repo.manager.transaction(async (manager) => {
      let lineRows = po.lines ?? [];
      if (lines !== undefined) {
        const existing = await manager.find(PurchaseOrderLine, { where: { purchaseOrder: { id: po.id } } });
        if (existing.length) {
          await manager.remove(existing);
        }
        lineRows = await manager.save(this.buildLineRows(manager, po, lines));
      }
      po.lines = lineRows;

      const { subtotalMinor, totalMinor } = computePoTotals(lineRows, po.taxRate);
      po.subtotalMinor = subtotalMinor;
      po.totalMinor = totalMinor;

      // No outbox event here — the plan's PO event vocabulary (§1) is
      // exactly created/sent/confirmed/received/canceled, with no generic
      // "updated" verb. A draft edit is a plain persisted change, not a
      // fact anything downstream needs to react to.
      const saved = await manager.save(po);
      saved.lines = lineRows;
      return saved;
    });
  }

  /**
   * `draft -> sent`: stamps `sentAt`, emits a `notify.send` command (template
   * `purchase_order`) onto marketing's `notify.commands` topic — a
   * cross-namespace command, not this service's own `po.events` domain-event
   * topic, so `recordOutboxEvent`'s `topic` override is required (same
   * mechanism as crm's `ReviewRequestsService.create()`). `Store_name` is
   * left out of the payload — no store-name lookup exists in purchasing_db
   * (opaque cross-DB `storeId`), same pre-existing gap `welcome`/
   * `review_request`'s payloads already accept; `notification`'s mapper logs
   * it missing rather than failing. Ack-and-skipped by notification's mapper
   * until Step 13, by design (no `purchase_order` branch exists there yet).
   */
  async send(storeId: string, id: string): Promise<PurchaseOrder> {
    const po = await this.findOne(storeId, id);
    const result = canTransitionPo(po.status, PoStatus.Sent);
    if (result.ok === false) {
      throw new ConflictException(`Purchase order ${id} cannot be sent from status ${po.status}`);
    }
    if (!po.lines || po.lines.length === 0) {
      throw new UnprocessableEntityException(`Purchase order ${id} has no lines`);
    }
    if (!po.emailTo) {
      throw new UnprocessableEntityException(`Purchase order ${id} has no recipient email set`);
    }
    const supplier = await assertSupplierOwned(this.supplierRepo, storeId, po.supplierId);

    po.status = PoStatus.Sent;
    po.sentAt = new Date();

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(po);

      await recordOutboxEvent(manager, {
        eventType: NOTIFY_SEND_COMMAND,
        storeId,
        aggregateType: PURCHASING_PO_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          template: 'purchase_order',
          poId: saved.id,
          supplierId: saved.supplierId,
          supplierName: supplier.name,
          email: saved.emailTo,
          subject: saved.emailSubject ?? undefined,
          body: saved.emailBody ?? undefined,
        },
        topic: topicForCommands(this.config.get<string>('PULSAR_TENANT', 'ecomiq'), 'marketing', 'notify'),
      });

      await recordOutboxEvent(manager, {
        eventType: PoEventType.PoSent,
        storeId,
        aggregateType: PURCHASING_PO_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  /**
   * The phone-call path: a merchant marking a PO confirmed on the
   * supplier's behalf after a phone call, for suppliers who never
   * registered for the portal. `confirmAsSupplier()` below (Step 12) is the
   * portal path — it just adds an ownership check before delegating here,
   * so only one place actually emits `PoConfirmed`/enforces the
   * `sent -> confirmed` guard.
   */
  async confirm(storeId: string, id: string): Promise<PurchaseOrder> {
    const po = await this.findOne(storeId, id);
    const result = canTransitionPo(po.status, PoStatus.Confirmed);
    if (result.ok === false) {
      throw new ConflictException(`Purchase order ${id} cannot be confirmed from status ${po.status}`);
    }
    po.status = PoStatus.Confirmed;

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(po);
      await recordOutboxEvent(manager, {
        eventType: PoEventType.PoConfirmed,
        storeId,
        aggregateType: PURCHASING_PO_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  /**
   * `POST /portal/pos/:id/confirm` (Step 12) — the supplier-portal path
   * onto the exact same `confirm()` above, gated by an ownership check a
   * staff caller doesn't need: a supplier must never be able to confirm
   * another supplier's PO by guessing an id. Same 404-regardless-of-
   * existence-vs-ownership shape as `assertSupplierOwned`.
   */
  async confirmAsSupplier(storeId: string, supplierId: string, id: string): Promise<PurchaseOrder> {
    const po = await this.findOne(storeId, id);
    if (po.supplierId !== supplierId) {
      throw new NotFoundException(`Purchase order ${id} not found`);
    }
    return this.confirm(storeId, id);
  }

  /**
   * `POST :id/receive` — line-level receiving. Legal from `sent` (suppliers
   * who ship without ever confirming), `confirmed`, and `partially_received`
   * (finishing the rest); the target status (`partially_received` vs
   * `received`) is *derived* from whether every line on the PO is now fully
   * received, then validated via the same `canTransitionPo` table used
   * everywhere else — no separate "legal from" list needed here, since
   * `draft`/`received`/`canceled` simply have no legal path to either
   * target in that table already.
   *
   * Rejects (422) rather than silently capping a request that would push
   * any line's `received_qty` past its `qty` — a merchant fat-fingering a
   * quantity should see an error, not have it quietly truncated.
   *
   * Publishes `purchasing.po.received` carrying `deliverToLocationId` +
   * exactly the lines/quantities *this call* received (not cumulative
   * totals) — everything inventory's Step 9 consumer needs to move stock
   * without a sync call back here. Lines with no `variantId` are still
   * included; Step 9's consumer skip-and-logs those (free-text lines never
   * matched to a real catalog variant).
   */
  async receive(storeId: string, id: string, dto: ReceivePurchaseOrderDto): Promise<PurchaseOrder> {
    const po = await this.findOne(storeId, id);
    const lines = po.lines ?? [];
    const byId = new Map(lines.map((line) => [line.id, line]));

    const receipt = applyReceipt(
      lines.map((line) => ({ lineId: line.id, qty: line.qty, receivedQty: line.receivedQty })),
      dto.lines,
    );
    if (receipt.ok === false) {
      if (receipt.reason === 'LINE_NOT_FOUND') {
        throw new NotFoundException(`Purchase order line ${receipt.lineId} not found on purchase order ${id}`);
      }
      throw new UnprocessableEntityException(
        `Line ${receipt.lineId} would receive ${receipt.attempted} against an ordered qty of ${receipt.ordered}`,
      );
    }

    const receivedThisCall: Array<{ line: PurchaseOrderLine; qty: number }> = dto.lines.map((entry) => ({
      line: byId.get(entry.lineId)!,
      qty: entry.qty,
    }));
    for (const { lineId, receivedQty } of receipt.updates) {
      byId.get(lineId)!.receivedQty = receivedQty;
    }

    const newStatus = receipt.fullyReceived ? PoStatus.Received : PoStatus.PartiallyReceived;
    const result = canTransitionPo(po.status, newStatus);
    if (result.ok === false) {
      throw new ConflictException(`Purchase order ${id} cannot be received from status ${po.status}`);
    }
    po.status = newStatus;

    return this.repo.manager.transaction(async (manager) => {
      await manager.save(receivedThisCall.map(({ line }) => line));
      const saved = await manager.save(po);
      saved.lines = lines;

      await recordOutboxEvent(manager, {
        eventType: PoEventType.PoReceived,
        storeId,
        aggregateType: PURCHASING_PO_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          ...this.toEventPayload(saved),
          deliverToLocationId: saved.deliverToLocationId ?? null,
          lines: receivedThisCall.map(({ line, qty }) => ({
            lineId: line.id,
            variantId: line.variantId ?? null,
            qty,
            // Post-increment cumulative total, not just this call's delta —
            // Step 9's inventory consumer needs it to build a natural,
            // replay-proof idempotency key (`poId:lineId:receivedQty`; a
            // second identical partial receipt would otherwise reuse the
            // same key as this one and be silently skipped as a duplicate).
            receivedQty: line.receivedQty,
          })),
        },
      });

      return saved;
    });
  }

  /** Legal from any non-terminal status (`po-status.util.ts`'s table) — already-terminal is a real 409, not a silent no-op. */
  async cancel(storeId: string, id: string): Promise<PurchaseOrder> {
    const po = await this.findOne(storeId, id);
    const result = canTransitionPo(po.status, PoStatus.Canceled);
    if (result.ok === false) {
      throw new ConflictException(`Purchase order ${id} cannot be canceled from status ${po.status}`);
    }
    po.status = PoStatus.Canceled;

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(po);
      await recordOutboxEvent(manager, {
        eventType: PoEventType.PoCanceled,
        storeId,
        aggregateType: PURCHASING_PO_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  private buildLineRows(
    manager: EntityManager,
    po: PurchaseOrder,
    lines: PurchaseOrderLineDto[],
  ): PurchaseOrderLine[] {
    return lines.map((line) =>
      manager.create(PurchaseOrderLine, {
        purchaseOrder: po,
        supplierCatalogItemId: line.supplierCatalogItemId ?? null,
        variantId: line.variantId ?? null,
        description: line.description,
        sku: line.sku ?? null,
        qty: line.qty,
        unitCostMinor: line.unitCostMinor,
      }),
    );
  }
}
