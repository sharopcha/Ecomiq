import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { CommentVisibility } from '../../entities/order-comment.entity';
import type { CreateOrderCommentRequestDto } from '@temp-nx/api-types/order';

export class CreateOrderCommentDto implements CreateOrderCommentRequestDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsEnum(CommentVisibility)
  visibility?: CommentVisibility;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentFileIds?: string[];
}
