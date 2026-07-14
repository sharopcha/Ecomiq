/**
 * `POST /marketing/forms/:id/submissions` (marketing-service) accepts an
 * arbitrary `Record<string, unknown>` body — each form has its own JSON
 * Schema validated server-side, there's no one fixed shape. This is the
 * shape the storefront's own newsletter signup form sends.
 */
export interface NewsletterSubscribeRequestDto {
  email: string;
}
