import { IsString, MinLength } from 'class-validator';

export class RenameFileDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
