import { mapStockLowActions } from './map-stock-low.util';
import { SendChannel } from '../entities/send-log.entity';
import { StockLowPayload } from './stock-low-event-payload';

const basePayload: StockLowPayload = {
  stockLevelId: 'sl_1',
  variantId: 'var_1',
  locationId: 'loc_1',
  alertId: 'alert_1',
  threshold: 10,
  direction: 'lower_than',
  actions: [],
  available: 3,
  onHand: 5,
  reserved: 2,
  status: 'low',
};

describe('mapStockLowActions', () => {
  it('maps send_email to a staff email dispatch item', () => {
    const items = mapStockLowActions('evt_1', { ...basePayload, actions: ['send_email'] }, 'staff@example.com', '+15550000000');
    expect(items).toHaveLength(1);
    expect(items[0].sourceEventId).toBe('evt_1:send_email');
    expect(items[0].input.channel).toBe(SendChannel.Email);
    expect(items[0].input.recipient).toBe('staff@example.com');
    expect(items[0].input.bodyOverride).toContain('var_1');
    expect(items[0].input.refTable).toBe('stock_alert');
    expect(items[0].input.refId).toBe('alert_1');
  });

  it('maps send_inbox to an in-app broadcast dispatch item', () => {
    const items = mapStockLowActions('evt_1', { ...basePayload, actions: ['send_inbox'] }, 'staff@example.com', '+15550000000');
    expect(items).toHaveLength(1);
    expect(items[0].sourceEventId).toBe('evt_1:send_inbox');
    expect(items[0].input.channel).toBe(SendChannel.InApp);
    expect(items[0].input.recipient).toBe('broadcast');
  });

  it('maps send_sms to a staff phone dispatch item', () => {
    const items = mapStockLowActions('evt_1', { ...basePayload, actions: ['send_sms'] }, 'staff@example.com', '+15550000000');
    expect(items).toHaveLength(1);
    expect(items[0].sourceEventId).toBe('evt_1:send_sms');
    expect(items[0].input.channel).toBe(SendChannel.Sms);
    expect(items[0].input.recipient).toBe('+15550000000');
  });

  it('ack-and-ignores create_task — no dispatch item produced', () => {
    const items = mapStockLowActions('evt_1', { ...basePayload, actions: ['create_task'] }, 'staff@example.com', '+15550000000');
    expect(items).toHaveLength(0);
  });

  it('ignores an unrecognized action without throwing', () => {
    const items = mapStockLowActions(
      'evt_1',
      { ...basePayload, actions: ['some_future_action' as never] },
      'staff@example.com',
      '+15550000000',
    );
    expect(items).toHaveLength(0);
  });

  it('fans out multiple actions into distinct items with distinct sourceEventIds', () => {
    const items = mapStockLowActions(
      'evt_1',
      { ...basePayload, actions: ['send_email', 'send_inbox', 'create_task'] },
      'staff@example.com',
      '+15550000000',
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.sourceEventId)).toEqual(['evt_1:send_email', 'evt_1:send_inbox']);
  });
});
