import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewRequest } from '../entities/review-request.entity';
import { Customer } from '../entities/customer.entity';
import { ReviewRequestsController } from './review-requests.controller';
import { ReviewRequestsService } from './review-requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReviewRequest, Customer])],
  controllers: [ReviewRequestsController],
  providers: [ReviewRequestsService],
})
export class ReviewRequestsModule {}
