import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { FormsService } from './forms.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';

/**
 * `/api/marketing/forms/*` — authenticated CRUD, same convention as
 * `DiscountsController`/`CampaignsController`. The public submission route
 * lives in a separate `FormSubmissionsController` (`@Public()` at class
 * level) — never mixed into this authenticated controller, same "dedicated
 * controller for the one public sub-route" convention as payment-service's
 * `WebhooksController`.
 */
@Controller('forms')
@UseGuards(PermissionsGuard)
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  @RequirePermissions('campaign:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.forms.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('campaign:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.forms.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('campaign:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFormDto) {
    return this.forms.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('campaign:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateFormDto) {
    return this.forms.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('campaign:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.forms.remove(user.storeId, id);
  }
}
