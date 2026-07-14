import { IsEmail, IsIn } from 'class-validator';
import { Role } from '@temp-nx/auth';

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsIn(['owner', 'admin', 'staff'])
  role!: Role;
}
