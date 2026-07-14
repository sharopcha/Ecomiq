import { ArrayMinSize, IsArray, IsString } from 'class-validator';

/** Full new order, front-to-back — must be exactly a permutation of the product's current image ids. */
export class ReorderProductImagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  imageIds!: string[];
}
