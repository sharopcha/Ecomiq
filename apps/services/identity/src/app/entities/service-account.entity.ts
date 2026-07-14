import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '@temp-nx/typeorm';

/**
 * A machine principal for service-to-service auth (client-credentials
 * grant — ADR-5). Deliberately a new entity, not a reuse of `ApiKey`:
 * `ApiKey` doesn't fit — it's store-scoped (`storeId`/`createdBy` FKs) for a
 * *tenant's own* programmatic access, whereas a service account has no
 * store_id at all (internal principals authenticate as the platform, not
 * as a user acting within a store) and is created by platform operators,
 * not store owners.
 */
@Entity({ name: 'service_account' })
export class ServiceAccount extends TimestampedEntity {
  /** Public identifier sent as `client_id` in the token request — not secret. */
  @Column({ type: 'text', name: 'client_id', unique: true })
  clientId!: string;

  /** bcrypt hash of the client secret — same hashing approach as user passwords (see BCRYPT_ROUNDS in auth.service.ts). The raw secret is shown once at creation and never stored. */
  @Column({ type: 'text', name: 'secret_hash' })
  secretHash!: string;

  /** Human-readable, e.g. 'order-service' — becomes the `svc` claim on issued tokens. */
  @Column({ type: 'text', name: 'service_name' })
  serviceName!: string;

  /** Internal scopes this account may ever be granted, e.g. ['inventory:reserve']. A token request can ask for a subset; see ServiceAccountsService.resolveScopes. */
  @Column({ type: 'text', array: true, name: 'allowed_scopes', default: '{}' })
  allowedScopes!: string[];

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
