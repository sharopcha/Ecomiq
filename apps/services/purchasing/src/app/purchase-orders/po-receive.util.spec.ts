import { applyReceipt } from './po-receive.util';

describe('applyReceipt', () => {
  it('partial receipt: one of two lines fully received leaves the PO not fully received', () => {
    const result = applyReceipt(
      [
        { lineId: 'line_1', qty: 10, receivedQty: 0 },
        { lineId: 'line_2', qty: 5, receivedQty: 0 },
      ],
      [{ lineId: 'line_1', qty: 10 }],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updates).toEqual([{ lineId: 'line_1', receivedQty: 10 }]);
    expect(result.fullyReceived).toBe(false);
  });

  it('full receipt: every line reaches its ordered qty', () => {
    const result = applyReceipt(
      [
        { lineId: 'line_1', qty: 10, receivedQty: 0 },
        { lineId: 'line_2', qty: 5, receivedQty: 5 },
      ],
      [{ lineId: 'line_1', qty: 10 }],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fullyReceived).toBe(true);
  });

  it('a prior partial receipt plus this call finishing the rest is fully received', () => {
    const result = applyReceipt(
      [{ lineId: 'line_1', qty: 10, receivedQty: 6 }],
      [{ lineId: 'line_1', qty: 4 }],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updates).toEqual([{ lineId: 'line_1', receivedQty: 10 }]);
    expect(result.fullyReceived).toBe(true);
  });

  it('over-receipt: rejects a delta that would push a line past its ordered qty', () => {
    const result = applyReceipt(
      [{ lineId: 'line_1', qty: 10, receivedQty: 8 }],
      [{ lineId: 'line_1', qty: 5 }],
    );
    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe('OVER_RECEIPT');
    if (result.reason !== 'OVER_RECEIPT') return;
    expect(result.lineId).toBe('line_1');
    expect(result.attempted).toBe(13);
    expect(result.ordered).toBe(10);
  });

  it('over-receipt: rejects when two entries for the same line cumulatively exceed the ordered qty', () => {
    const result = applyReceipt(
      [{ lineId: 'line_1', qty: 10, receivedQty: 0 }],
      [
        { lineId: 'line_1', qty: 6 },
        { lineId: 'line_1', qty: 6 },
      ],
    );
    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe('OVER_RECEIPT');
    if (result.reason !== 'OVER_RECEIPT') return;
    expect(result.attempted).toBe(12);
  });

  it('rejects an entry referencing a lineId that does not exist on the PO', () => {
    const result = applyReceipt(
      [{ lineId: 'line_1', qty: 10, receivedQty: 0 }],
      [{ lineId: 'line_ghost', qty: 1 }],
    );
    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe('LINE_NOT_FOUND');
    expect(result.lineId).toBe('line_ghost');
  });

  it('a line not touched by this call still counts toward fullyReceived if already at its ordered qty', () => {
    const result = applyReceipt(
      [
        { lineId: 'line_1', qty: 10, receivedQty: 10 },
        { lineId: 'line_2', qty: 5, receivedQty: 0 },
      ],
      [{ lineId: 'line_2', qty: 5 }],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fullyReceived).toBe(true);
  });
});
