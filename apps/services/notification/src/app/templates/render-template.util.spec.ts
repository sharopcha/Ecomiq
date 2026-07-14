import { renderTemplate } from './render-template.util';

describe('renderTemplate', () => {
  it('interpolates every variable present in vars', () => {
    const result = renderTemplate(
      { subject: 'Hi {{Customer_name}}', body: 'Order {{Order_ID}} from {{Store_name}}' },
      { Customer_name: 'Ada', Order_ID: '1042', Store_name: 'Ecomiq Demo' },
    );
    expect(result.subject).toBe('Hi Ada');
    expect(result.body).toBe('Order 1042 from Ecomiq Demo');
    expect(result.missing).toEqual([]);
  });

  it('leaves unknown variables literal and reports them in missing', () => {
    const result = renderTemplate(
      { subject: 'Hi {{Customer_name}}', body: 'Ref {{Unknown_var}}' },
      { Customer_name: 'Ada' },
    );
    expect(result.subject).toBe('Hi Ada');
    expect(result.body).toBe('Ref {{Unknown_var}}');
    expect(result.missing).toEqual(['Unknown_var']);
  });

  it('never throws — a template with no variables passes through untouched', () => {
    const result = renderTemplate({ subject: 'Static subject', body: 'Static body' }, {});
    expect(result).toEqual({ subject: 'Static subject', body: 'Static body', missing: [] });
  });

  it('handles null subject/body as empty strings', () => {
    const result = renderTemplate({ subject: null, body: null }, { Customer_name: 'Ada' });
    expect(result).toEqual({ subject: '', body: '', missing: [] });
  });

  it('leaves surrounding HTML markup untouched, only replacing the variable tokens', () => {
    const result = renderTemplate(
      {
        subject: null,
        body: '<p>Hi {{Customer_name}},</p><p>Your order <b>{{Order_ID}}</b> shipped.</p>',
      },
      { Customer_name: 'Ada', Order_ID: '1042' },
    );
    expect(result.body).toBe('<p>Hi Ada,</p><p>Your order <b>1042</b> shipped.</p>');
    expect(result.missing).toEqual([]);
  });

  it('deduplicates repeated missing variables', () => {
    const result = renderTemplate(
      { subject: '{{Missing_var}} and {{Missing_var}} again', body: '' },
      {},
    );
    expect(result.missing).toEqual(['Missing_var']);
  });
});
