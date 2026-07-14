import { IsOptional, IsString } from 'class-validator';

export class SetOrderNoteDto {
  /** Omit or send `null`-equivalent (empty string) to clear the note. */
  @IsOptional()
  @IsString()
  note?: string;
}
