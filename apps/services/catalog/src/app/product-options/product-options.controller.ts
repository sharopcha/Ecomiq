import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { ProductOptionsService } from './product-options.service';
import { CreateProductOptionDto } from './dto/create-product-option.dto';
import { UpdateProductOptionDto } from './dto/update-product-option.dto';
import { CreateOptionValueDto } from './dto/create-option-value.dto';
import { UpdateOptionValueDto } from './dto/update-option-value.dto';

/** Nested under a product — options only ever make sense in the context of one. */
@Controller('products/:productId/options')
@UseGuards(PermissionsGuard)
export class ProductOptionsController {
  constructor(private readonly options: ProductOptionsService) {}

  @Get()
  @RequirePermissions('products:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    return this.options.findAll(user.storeId, productId);
  }

  @Post()
  @RequirePermissions('products:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: CreateProductOptionDto,
  ) {
    return this.options.create(user.storeId, productId, dto);
  }

  @Patch(':optionId')
  @RequirePermissions('products:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateProductOptionDto,
  ) {
    return this.options.update(user.storeId, productId, optionId, dto);
  }

  @Delete(':optionId')
  @RequirePermissions('products:write')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('optionId') optionId: string,
  ) {
    return this.options.remove(user.storeId, productId, optionId);
  }

  @Post(':optionId/values')
  @RequirePermissions('products:write')
  addValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('optionId') optionId: string,
    @Body() dto: CreateOptionValueDto,
  ) {
    return this.options.addValue(user.storeId, productId, optionId, dto);
  }

  @Patch(':optionId/values/:valueId')
  @RequirePermissions('products:write')
  updateValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('optionId') optionId: string,
    @Param('valueId') valueId: string,
    @Body() dto: UpdateOptionValueDto,
  ) {
    return this.options.updateValue(user.storeId, productId, optionId, valueId, dto);
  }

  @Delete(':optionId/values/:valueId')
  @RequirePermissions('products:write')
  removeValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('optionId') optionId: string,
    @Param('valueId') valueId: string,
  ) {
    return this.options.removeValue(user.storeId, productId, optionId, valueId);
  }
}
