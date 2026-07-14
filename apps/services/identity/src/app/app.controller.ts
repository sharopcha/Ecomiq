import { Controller, Get } from '@nestjs/common';
import { Public } from '@temp-nx/auth';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  getData() {
    return this.appService.getData();
  }
}
