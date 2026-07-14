import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { FindReservationsQueryDto } from './dto/find-reservations-query.dto';

/** "Reserve Item" row action + its release. No PATCH/DELETE — a reservation's only state transition is releasedAt going from null to set, done via the dedicated /release endpoint, not a generic update. */
@Controller('reservations')
@UseGuards(PermissionsGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @RequirePermissions('inventory:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindReservationsQueryDto) {
    return this.reservations.list(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reservations.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('inventory:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReservationDto) {
    return this.reservations.create(user.storeId, dto);
  }

  @Post(':id/release')
  @RequirePermissions('inventory:write')
  release(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reservations.release(user.storeId, id);
  }
}
