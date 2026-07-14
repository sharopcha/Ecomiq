export interface ReceiveLineState {
  lineId: string;
  /** ordered qty */
  qty: number;
  /** cumulative qty received before this call */
  receivedQty: number;
}

export interface ReceiveLineEntry {
  lineId: string;
  /** qty received in this call (delta, not cumulative) */
  qty: number;
}

export type ApplyReceiptResult =
  | {
      ok: true;
      /** cumulative receivedQty per line touched this call */
      updates: Array<{ lineId: string; receivedQty: number }>;
      /** true once every line on the PO is fully received, not just the ones in this call */
      fullyReceived: boolean;
    }
  | { ok: false; reason: 'LINE_NOT_FOUND'; lineId: string }
  | { ok: false; reason: 'OVER_RECEIPT'; lineId: string; attempted: number; ordered: number };

/**
 * Pure derivation for `PurchaseOrdersService.receive()`: given every line's
 * ordered/already-received qty and the entries this call wants to apply,
 * either rejects (unknown line, or a line pushed past its ordered qty) or
 * returns the resulting cumulative per-line totals plus whether the whole PO
 * is now fully received. Repeated entries for the same lineId within one
 * call accumulate against each other, not just against the pre-call state —
 * mirrors the mutate-in-a-loop behavior the inline version had.
 */
export function applyReceipt(lines: ReceiveLineState[], entries: ReceiveLineEntry[]): ApplyReceiptResult {
  const byId = new Map(lines.map((line) => [line.lineId, line]));
  const runningReceivedQty = new Map(lines.map((line) => [line.lineId, line.receivedQty]));

  for (const entry of entries) {
    const line = byId.get(entry.lineId);
    if (!line) {
      return { ok: false, reason: 'LINE_NOT_FOUND', lineId: entry.lineId };
    }
    const newReceivedQty = (runningReceivedQty.get(entry.lineId) ?? line.receivedQty) + entry.qty;
    if (newReceivedQty > line.qty) {
      return { ok: false, reason: 'OVER_RECEIPT', lineId: entry.lineId, attempted: newReceivedQty, ordered: line.qty };
    }
    runningReceivedQty.set(entry.lineId, newReceivedQty);
  }

  return {
    ok: true,
    updates: entries.map((entry) => ({ lineId: entry.lineId, receivedQty: runningReceivedQty.get(entry.lineId)! })),
    fullyReceived: lines.every((line) => runningReceivedQty.get(line.lineId)! >= line.qty),
  };
}
