import { IsIn, IsOptional, IsString } from 'class-validator';

/** Body for `POST /auth/token` — OAuth2 client-credentials grant. */
export class ClientCredentialsDto {
  @IsIn(['client_credentials'])
  grant_type!: 'client_credentials';

  @IsString()
  client_id!: string;

  @IsString()
  client_secret!: string;

  /** Space-delimited requested scopes (OAuth2 convention), e.g. "inventory:reserve". Omit to receive everything the account is allowed. */
  @IsOptional()
  @IsString()
  scope?: string;
}
