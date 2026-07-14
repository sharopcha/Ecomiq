import { canTransitionPo, isTerminalPoStatus } from './po-status.util';
import { PoStatus } from '../entities/purchase-order.entity';

describe('canTransitionPo', () => {
  const ALL_STATUSES = Object.values(PoStatus);

  const LEGAL: Array<[PoStatus, PoStatus]> = [
    [PoStatus.Draft, PoStatus.Sent],
    [PoStatus.Draft, PoStatus.Canceled],
    [PoStatus.Sent, PoStatus.Confirmed],
    [PoStatus.Sent, PoStatus.PartiallyReceived],
    [PoStatus.Sent, PoStatus.Received],
    [PoStatus.Sent, PoStatus.Canceled],
    [PoStatus.Confirmed, PoStatus.PartiallyReceived],
    [PoStatus.Confirmed, PoStatus.Received],
    [PoStatus.Confirmed, PoStatus.Canceled],
    [PoStatus.PartiallyReceived, PoStatus.Received],
    [PoStatus.PartiallyReceived, PoStatus.Canceled],
  ];

  it.each(LEGAL)('allows %s -> %s', (from, to) => {
    expect(canTransitionPo(from, to)).toEqual({ ok: true });
  });

  it('rejects every transition not on the legal list, exhaustively over the full status x status matrix', () => {
    const legalSet = new Set(LEGAL.map(([from, to]) => `${from}->${to}`));
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const key = `${from}->${to}`;
        const result = canTransitionPo(from, to);
        if (legalSet.has(key)) {
          expect(result).toEqual({ ok: true });
        } else {
          expect(result).toEqual({ ok: false, reason: 'ILLEGAL_TRANSITION' });
        }
      }
    }
  });

  it('rejects a same-status no-op transition', () => {
    expect(canTransitionPo(PoStatus.Sent, PoStatus.Sent)).toEqual({ ok: false, reason: 'ILLEGAL_TRANSITION' });
  });

  it('rejects a backward transition (received -> sent)', () => {
    expect(canTransitionPo(PoStatus.Received, PoStatus.Sent)).toEqual({ ok: false, reason: 'ILLEGAL_TRANSITION' });
  });

  it('rejects skipping straight from draft to received', () => {
    expect(canTransitionPo(PoStatus.Draft, PoStatus.Received)).toEqual({
      ok: false,
      reason: 'ILLEGAL_TRANSITION',
    });
  });
});

describe('isTerminalPoStatus', () => {
  it('received and canceled are terminal', () => {
    expect(isTerminalPoStatus(PoStatus.Received)).toBe(true);
    expect(isTerminalPoStatus(PoStatus.Canceled)).toBe(true);
  });

  it('draft, sent, confirmed, and partially_received are not terminal', () => {
    expect(isTerminalPoStatus(PoStatus.Draft)).toBe(false);
    expect(isTerminalPoStatus(PoStatus.Sent)).toBe(false);
    expect(isTerminalPoStatus(PoStatus.Confirmed)).toBe(false);
    expect(isTerminalPoStatus(PoStatus.PartiallyReceived)).toBe(false);
  });
});
