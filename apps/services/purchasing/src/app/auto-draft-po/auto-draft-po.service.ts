import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Supplier } from '../entities/supplier.entity';
import { SupplierCatalogItem } from '../entities/supplier-catalog-item.entity';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { CreatePurchaseOrderDto } from '../purchase-orders/dto/create-purchase-order.dto';
import { ReorderTriggeredPayload } from './reorder-triggered-payload';
import { checkAutoDraftEligibility } from './auto-draft-eligibility.util';

const UNIQUE_VIOLATION = '23505';

/**
 * An additive consumer of inventory-service's own events — the reverse
 * direction of Step 9's cross-service relationship. Zero changes to
 * `PurchaseOrdersService.create()` beyond the optional `sourceReorderRuleId`
 * parameter it already gained for this exact caller.
 */
@Injectable()
export class AutoDraftPoService {
  private readonly logger = new Logger(AutoDraftPoService.name);

  constructor(
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(SupplierCatalogItem)
    private readonly catalogItemRepo: Repository<SupplierCatalogItem>,
    private readonly purchaseOrders: PurchaseOrdersService,
  ) {}

  /**
   * `inventory.reorder.triggered` — only acts on `method: 'purchase_order'`
   * (the `restock_alert` path already sends its own stock alert, inventory-
   * side, out of scope here) and a non-null `preferredSupplierId` (null ->
   * ack-and-log; the merchant already sees the alert inventory itself
   * sends). Resolves a unit cost from a `variantId`-matching
   * `SupplierCatalogItem` for the preferred supplier; none found -> 0 plus
   * a note flagging it for the merchant to fill in before sending.
   *
   * Dedup relies on `PurchaseOrder`'s partial unique index on
   * `sourceReorderRuleId` (open-status predicate) rather than a pre-check
   * query — same "try the write, catch the constraint violation" idempotency
   * shape as Step 9's `PurchasingSyncService`. A re-trigger while a draft
   * from this same rule is already open (not yet received/canceled) is
   * caught here and logged as a no-op.
   */
  async applyReorderTriggered(storeId: string, payload: ReorderTriggeredPayload): Promise<void> {
    const eligibility = checkAutoDraftEligibility(payload);
    if (eligibility.eligible === false) {
      if (eligibility.reason === 'NOT_PURCHASE_ORDER_METHOD') {
        return;
      }
      this.logger.log(
        `inventory.reorder.triggered skipped: rule ${payload.reorderRuleId} has no preferredSupplierId`,
      );
      return;
    }

    const supplier = await this.supplierRepo.findOne({
      where: { id: payload.preferredSupplierId, storeId },
    });
    if (!supplier) {
      this.logger.log(
        `inventory.reorder.triggered skipped: supplier ${payload.preferredSupplierId} not found in store ${storeId}`,
      );
      return;
    }

    const catalogItem = await this.catalogItemRepo.findOne({
      where: { storeId, supplierId: supplier.id, variantId: payload.variantId },
    });
    const unitCostMinor = catalogItem?.priceMinMinor ?? 0;
    const note =
      catalogItem?.priceMinMinor != null
        ? `Auto-drafted from reorder rule ${payload.reorderRuleId}.`
        : `Auto-drafted from reorder rule ${payload.reorderRuleId}. No matching supplier catalog item for variant ${payload.variantId} — unit cost defaulted to 0, please review before sending.`;

    const dto: CreatePurchaseOrderDto = {
      supplierId: supplier.id,
      deliverToLocationId: payload.locationId,
      note,
      lines: [
        {
          variantId: payload.variantId,
          description: `Auto-reorder — variant ${payload.variantId}`,
          qty: payload.reorderQty,
          unitCostMinor,
        },
      ],
    } as CreatePurchaseOrderDto;

    try {
      const po = await this.purchaseOrders.create(storeId, dto, payload.reorderRuleId);
      this.logger.log(`auto-drafted PO ${po.displayId} for reorder rule ${payload.reorderRuleId}`);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        this.logger.log(
          `inventory.reorder.triggered: reorder rule ${payload.reorderRuleId} already has an open auto-draft PO, skipping`,
        );
        return;
      }
      throw err;
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
