import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { ShipmentsService } from '../shipments/shipments.service';
import { ShipmentNotifyService } from './shipment-notify.service';
import { NotifyShipmentDto } from './dto/notify-shipment.dto';

/**
 * `POST /api/shipping/shipments/:id/notify` — a second controller sharing
 * the `shipments` base path, same "narrow sub-resource controller" pattern
 * as order's `ReturnCommentsController` alongside `OrdersController`.
 * Verifies the parent shipment exists/belongs to this store via
 * `ShipmentsService.findOne()` before ever touching the notification
 * table — same "404 before the child query runs" discipline.
 */
@Controller('shipments')
@UseGuards(PermissionsGuard)
export class ShipmentNotifyController {
  constructor(
    private readonly shipments: ShipmentsService,
    private readonly notify: ShipmentNotifyService,
  ) {}

  @Post(':id/notify')
  @RequirePermissions('shipments:write')
  async notifyShipment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: NotifyShipmentDto,
  ) {
    await this.shipments.findOne(user.storeId, id);
    return this.notify.create(user.storeId, id, dto);
  }
}
