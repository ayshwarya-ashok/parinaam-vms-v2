import { N8nClient } from './n8n.client';
import type { AppConfig } from '../../config';

/**
 * The HMAC boundary is the only thing standing between the status callback and
 * an attacker marking every queued message as delivered — so it gets a spec
 * before anything else does.
 */
describe('N8nClient signature handling', () => {
  const secret = 'test_secret_at_least_16_chars';
  const config = {
    get: (key: string) => (key === 'VMS_WEBHOOK_SECRET' ? secret : undefined),
  } as unknown as AppConfig;

  const client = new N8nClient(config);
  const body = { emailLogId: 'abc', status: 'sent' };

  it('signs deterministically over the JSON body', () => {
    expect(client.sign(body)).toBe(client.sign({ emailLogId: 'abc', status: 'sent' }));
  });

  it('accepts its own signature', () => {
    expect(client.verify(body, client.sign(body))).toBe(true);
  });

  it('rejects a missing signature', () => {
    expect(client.verify(body, undefined)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const signature = client.sign(body);
    expect(client.verify({ ...body, status: 'failed' }, signature)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    expect(client.verify(body, 'deadbeef')).toBe(false);
  });

  it('is sensitive to key order — the raw bytes are the contract', () => {
    // n8n signs JSON.stringify of the object it sends; a re-serialisation that
    // reorders keys must NOT verify, which is why the webhook controller
    // prefers the raw request body.
    const reordered = { status: 'sent', emailLogId: 'abc' };
    expect(client.verify(reordered, client.sign(body))).toBe(false);
  });
});
