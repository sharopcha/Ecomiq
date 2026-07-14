import { IsString } from 'class-validator';

export class SelectStoreDto {
  @IsString()
  selectionToken!: string;

  @IsString()
  storeId!: string;
}
