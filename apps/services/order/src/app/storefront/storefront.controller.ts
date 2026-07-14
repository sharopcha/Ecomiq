import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { ComposeOrderDto } from './dto/compose-order.dto';
import { CurrentCustomer, CustomerAuth } from '@temp-nx/auth';

@Controller('storefront')
@CustomerAuth() // Applies JwtAuthGuard configured for CRM JWTs
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Post('compose')
  async composeOrder(
    @CurrentCustomer() customerId: string,
    @Body() dto: ComposeOrderDto,
  ) {
    return this.storefrontService.composeOrder(customerId, dto);
  }

  @Get('my-orders')
  async getMyOrders(@CurrentCustomer() customerId: string) {
    return { orders: await this.storefrontService.getMyOrders(customerId) };
  }

  @Get('my-orders/:id')
  async getMyOrder(@CurrentCustomer() customerId: string, @Param('id') id: string) {
    return this.storefrontService.getOrderDetail(customerId, id);
  }

  @Get('my-orders/:id/status')
  async getMyOrderStatus(@CurrentCustomer() customerId: string, @Param('id') id: string) {
    return this.storefrontService.getOrderStatus(customerId, id);
  }
}
