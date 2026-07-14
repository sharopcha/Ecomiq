import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { FormStatus } from '../../entities/form.entity';

export class UpdateFormDto {
  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(FormStatus)
  status?: FormStatus;
}
