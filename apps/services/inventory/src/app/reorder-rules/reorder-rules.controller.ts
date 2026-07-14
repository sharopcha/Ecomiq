import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { ReorderRulesService } from './reorder-rules.service';
import { CreateReorderRuleDto } from './dto/create-reorder-rule.dto';
import { UpdateReorderRuleDto } from './dto/update-reorder-rule.dto';
import { FindReorderRulesQueryDto } from './dto/find-reorder-rules-query.dto';

@Controller('reorder-rules')
@UseGuards(PermissionsGuard)
export class ReorderRulesController {
  constructor(private readonly reorderRules: ReorderRulesService) {}

  @Get()
  @RequirePermissions('inventory:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindReorderRulesQueryDto) {
    return this.reorderRules.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reorderRules.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('inventory:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReorderRuleDto) {
    return this.reorderRules.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReorderRuleDto,
  ) {
    return this.reorderRules.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('inventory:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reorderRules.remove(user.storeId, id);
  }
}
