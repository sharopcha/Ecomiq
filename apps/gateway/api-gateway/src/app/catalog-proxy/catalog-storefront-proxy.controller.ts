import { All, Controller, Req, Res, Post, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';
import { Public } from '@temp-nx/auth';

/**
 * Public reverse proxy for catalog-service's storefront module.
 * 
 * Bypasses the gateway's global JwtAuthGuard by using @Public(), allowing
 * anonymous shoppers to view products and categories.
 */
@Controller('catalog/storefront')
@Public()
export class CatalogStorefrontProxyController {
  private readonly catalogBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.catalogBaseUrl = this.config
      .get<string>('CATALOG_SERVICE_URL', 'http://localhost:3002/api')
      .replace(/\/$/, '') + '/storefront';
  }

  @Post('orders')
  async createOrderStub(@Req() req: Request, @Res() res: Response) {
    // Stub implementation for Step 11 since Order Service is out of scope
    return res.status(201).json({
      id: `ord_${Math.random().toString(36).substring(2, 9)}`,
      status: 'pending',
      message: 'Order successfully stubbed.',
    });
  }

  @Get('orders/:id/status')
  async getOrderStatusStub(@Req() req: Request, @Res() res: Response) {
    // Stub implementation for Step 14
    return res.status(200).json({
      id: req.params.id,
      status: 'confirmed', // immediately confirmed for stub
    });
  }

  @All()
  async proxyRoot(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res);
  }

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    // Cache headers per §1 rule 2
    res.set('Cache-Control', 'public, s-maxage=300');
    
    return proxyRequest(req, res, {
      baseUrl: this.catalogBaseUrl,
      matchPrefix: '/api/catalog/storefront',
    });
  }
}
