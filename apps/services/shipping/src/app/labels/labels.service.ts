import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TenantScopedCrudService, assertOwnedByStore } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { ShippingLabel } from '../entities/shipping-label.entity';
import { ShippingLabelPackage } from '../entities/shipping-label-package.entity';
import { PackagePreset } from '../entities/package-preset.entity';
import { CarrierProviderPort, RateDestinationInput } from '../carrier/carrier-provider.port';
import { SHIPPING_LABEL_AGGREGATE_TYPE, ShippingLabelEventType } from '../events/shipping-event-types';
import { CreateShippingLabelDto, CreateShippingLabelPackageDto } from './dto/create-shipping-label.dto';
import { UpdateShippingLabelDto } from './dto/update-shipping-label.dto';

@Injectable()
export class LabelsService extends TenantScopedCrudService<ShippingLabel> {
  protected readonly alias = 'shipping_label';

  constructor(
    @InjectRepository(ShippingLabel) repo: Repository<ShippingLabel>,
    private readonly carrierProvider: CarrierProviderPort,
  ) {
    super(repo);
  }

  /** Detail view — full relations (each package), unlike the list view's base findAll. */
  override async findOne(storeId: string, id: string): Promise<ShippingLabel> {
    const label = await this.repo.findOne({ where: { id }, relations: { packages: true } });
    return assertOwnedByStore(label, storeId, () => new NotFoundException(`Shipping label ${id} not found`));
  }

  override async create(storeId: string, dto: CreateShippingLabelDto): Promise<ShippingLabel> {
    const destination = toDestinationInput(dto.destinationAddress);
    const rate = await this.carrierProvider.getRates({
      carrier: dto.carrier,
      packages: dto.packages,
      destination,
    });
    // `=== false` narrowing only — repo rule (tsconfig.base.json has no strictNullChecks).
    if (rate.ok === false) {
      throw new UnprocessableEntityException(rate.message);
    }

    const label = this.repo.create({
      storeId,
      orderId: dto.orderId,
      carrier: dto.carrier,
      serviceType: dto.serviceType ?? null,
      insurance: dto.insurance ?? null,
      shipDate: dto.shipDate ?? null,
      notifyCustomer: dto.notifyCustomer ?? false,
      returnAddress: dto.returnAddress ?? null,
      destinationAddress: dto.destinationAddress ?? null,
      subtotalMinor: rate.subtotalMinor,
      discountMinor: rate.discountMinor,
      totalMinor: rate.totalMinor,
    });

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(label);
      saved.packages = await manager.save(this.buildPackageRows(manager, saved, dto.packages));
      return saved;
    });
  }

  /** Replace-all semantics for `packages` — "here is the label's contents now," same approach as catalog's Bundle.items. */
  override async update(storeId: string, id: string, dto: UpdateShippingLabelDto): Promise<ShippingLabel> {
    const label = await this.findOne(storeId, id);
    assertNotPurchased(label);
    const { packages, ...rest } = dto;
    Object.assign(label, rest);

    return this.repo.manager.transaction(async (manager) => {
      let packageRows = label.packages ?? [];
      if (packages !== undefined) {
        const existing = await manager.find(ShippingLabelPackage, { where: { label: { id: label.id } } });
        if (existing.length) {
          await manager.remove(existing);
        }
        packageRows = await manager.save(this.buildPackageRows(manager, label, packages));
      }
      label.packages = packageRows;

      const rate = await this.carrierProvider.getRates({
        carrier: label.carrier,
        packages: packageRows,
        destination: toDestinationInput(label.destinationAddress),
      });
      if (rate.ok === false) {
        throw new UnprocessableEntityException(rate.message);
      }
      label.subtotalMinor = rate.subtotalMinor;
      label.discountMinor = rate.discountMinor;
      label.totalMinor = rate.totalMinor;

      const saved = await manager.save(label);
      saved.packages = packageRows;
      return saved;
    });
  }

  override async remove(storeId: string, id: string): Promise<void> {
    const label = await this.findOne(storeId, id);
    assertNotPurchased(label);
    await this.repo.remove(label);
  }

  /**
   * `POST /labels/:id/purchase` — calls the carrier port with the label's
   * own persisted packages + destination snapshot (no request body needed).
   * Success sets `purchasedAt`/`totalMinor`/`labelFileId` and publishes
   * `shipping.label.purchased`; a port rejection leaves the label a draft
   * and publishes `shipping.label.purchase_failed` instead (both inside the
   * same transaction as the row write, outbox-pattern precedent). The
   * fabricated `trackingNumber` rides only the outbox event payload — no
   * column for it here, the durable `tracking_number` row belongs to
   * fulfillment once that domain exists.
   */
  async purchase(storeId: string, id: string): Promise<ShippingLabel> {
    const label = await this.findOne(storeId, id);
    assertNotPurchased(label);

    const result = await this.carrierProvider.purchaseLabel({
      labelId: label.id,
      carrier: label.carrier,
      packages: label.packages ?? [],
      destination: toDestinationInput(label.destinationAddress),
    });

    return this.repo.manager.transaction(async (manager) => {
      if (result.ok === false) {
        await recordOutboxEvent(manager, {
          eventType: ShippingLabelEventType.LabelPurchaseFailed,
          storeId,
          aggregateType: SHIPPING_LABEL_AGGREGATE_TYPE,
          aggregateId: label.id,
          payload: { labelId: label.id, orderId: label.orderId, reason: result.reason, message: result.message },
        });
        throw new UnprocessableEntityException(result.message);
      }

      label.purchasedAt = new Date();
      label.totalMinor = result.totalMinor;
      label.labelFileId = result.labelUrl;
      const saved = await manager.save(label);

      await recordOutboxEvent(manager, {
        eventType: ShippingLabelEventType.LabelPurchased,
        storeId,
        aggregateType: SHIPPING_LABEL_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          labelId: saved.id,
          orderId: saved.orderId,
          carrier: saved.carrier,
          trackingNumber: result.trackingNumber,
          labelUrl: result.labelUrl,
          totalMinor: result.totalMinor,
        },
      });
      return saved;
    });
  }

  private buildPackageRows(
    manager: EntityManager,
    label: ShippingLabel,
    packages: CreateShippingLabelPackageDto[],
  ): ShippingLabelPackage[] {
    return packages.map((pkg) =>
      manager.create(ShippingLabelPackage, {
        label,
        orderLineId: pkg.orderLineId ?? null,
        packagePreset: pkg.packagePresetId ? ({ id: pkg.packagePresetId } as PackagePreset) : null,
        packageName: pkg.packageName ?? null,
        packageType: pkg.packageType ?? null,
        itemWeightKg: pkg.itemWeightKg ?? null,
        totalWeightKg: pkg.totalWeightKg ?? null,
        lengthCm: pkg.lengthCm ?? null,
        widthCm: pkg.widthCm ?? null,
        heightCm: pkg.heightCm ?? null,
        combined: pkg.combined ?? false,
      }),
    );
  }
}

/** Purchased labels are immutable — 409 on any further update/delete/purchase attempt. */
function assertNotPurchased(label: ShippingLabel): void {
  if (label.purchasedAt) {
    throw new ConflictException(`Shipping label ${label.id} is already purchased and cannot be modified`);
  }
}

function toDestinationInput(address: Record<string, unknown> | null | undefined): RateDestinationInput {
  return {
    postalCode: typeof address?.['postalCode'] === 'string' ? (address['postalCode'] as string) : null,
    countryCode: typeof address?.['countryCode'] === 'string' ? (address['countryCode'] as string) : null,
    city: typeof address?.['city'] === 'string' ? (address['city'] as string) : null,
  };
}
