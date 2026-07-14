/**
 * Contract test for the checked-in ts-proto output. Most of the value here
 * is compile-time — this file only typechecks if the generated interfaces
 * still match the shape inventory-service's gRPC controller and any client
 * are coded against — but a wire round-trip also catches things tsc can't: field
 * numbers shifting, the `oneof` failure/success split actually being
 * mutually exclusive on the wire, and the Timestamp <-> Date mapping
 * (`useDate=true`) surviving encode/decode.
 */
import {
  ReserveStockRequest,
  ReserveStockResponse,
  ReleaseReservationRequest,
  ReleaseReservationResponse,
  ReservationFailureReason,
} from './generated/inventory/v1/reservation';

describe('ReservationService generated contract', () => {
  it('round-trips a ReserveStockRequest with an explicit location_id', () => {
    const original: ReserveStockRequest = {
      storeId: 'store_1',
      variantId: 'variant_1',
      locationId: 'location_1',
      qty: 3,
      orderId: 'order_1',
      orderLineId: 'line_1',
      idempotencyKey: 'idem_1',
    };
    const decoded = ReserveStockRequest.decode(ReserveStockRequest.encode(original).finish());
    expect(decoded).toEqual(original);
  });

  it('round-trips a ReserveStockRequest that omits location_id (server picks one)', () => {
    const original: ReserveStockRequest = {
      storeId: 'store_1',
      variantId: 'variant_1',
      qty: 1,
      orderId: 'order_1',
      orderLineId: 'line_1',
      idempotencyKey: 'idem_2',
    };
    const decoded = ReserveStockRequest.decode(ReserveStockRequest.encode(original).finish());
    expect(decoded.locationId).toBeUndefined();
    expect(decoded).toEqual(original);
  });

  it('round-trips a successful reservation, including the Timestamp <-> Date mapping', () => {
    const reservedUntil = new Date('2026-08-01T00:00:00.000Z');
    const original: ReserveStockResponse = {
      reserved: { reservationId: 'res_1', reservedUntil },
    };
    const decoded = ReserveStockResponse.decode(ReserveStockResponse.encode(original).finish());
    expect(decoded.reserved?.reservationId).toBe('res_1');
    expect(decoded.reserved?.reservedUntil?.getTime()).toBe(reservedUntil.getTime());
    expect(decoded.failure).toBeUndefined();
  });

  it('round-trips a typed insufficient-stock failure via the oneof, not a thrown error', () => {
    const original: ReserveStockResponse = {
      failure: {
        reason: ReservationFailureReason.INSUFFICIENT_STOCK,
        message: 'not enough on hand',
      },
    };
    const decoded = ReserveStockResponse.decode(ReserveStockResponse.encode(original).finish());
    expect(decoded.failure).toEqual(original.failure);
    expect(decoded.reserved).toBeUndefined();
  });

  it('round-trips ReleaseReservation request/response, including released_at', () => {
    const req: ReleaseReservationRequest = {
      storeId: 'store_1',
      reservationId: 'res_1',
      idempotencyKey: 'idem_3',
    };
    const decodedReq = ReleaseReservationRequest.decode(
      ReleaseReservationRequest.encode(req).finish(),
    );
    expect(decodedReq).toEqual(req);

    const releasedAt = new Date('2026-08-02T12:00:00.000Z');
    const res: ReleaseReservationResponse = {
      released: { reservationId: 'res_1', releasedAt },
    };
    const decodedRes = ReleaseReservationResponse.decode(
      ReleaseReservationResponse.encode(res).finish(),
    );
    expect(decodedRes.released?.releasedAt?.getTime()).toBe(releasedAt.getTime());
  });
});
