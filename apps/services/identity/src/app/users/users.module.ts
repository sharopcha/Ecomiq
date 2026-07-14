import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppUser } from '../entities/app-user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppUser])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
