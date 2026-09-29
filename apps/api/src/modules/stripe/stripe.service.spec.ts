import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';

describe('StripeService.constructWebhookEvent', () => {
  const secret = 'whsec_test_livemode_check_0000';
  const signer = new Stripe('sk_test_signer');

  function service(mode: 'test' | 'live'): StripeService {
    const values: Record<string, string> = {
      'stripe.secretKey': `sk_${mode}_0000000000000000000000`,
      'stripe.apiVersion': '2026-02-25.clover',
      'stripe.webhookSecret': secret,
      'stripe.mode': mode,
    };
    const config = {
      get: (key: string) => values[key],
      getOrThrow: (key: string) => values[key],
    } as unknown as ConfigService;
    const stripe = new StripeService(config);
    stripe.onModuleInit();
    return stripe;
  }

  function signed(livemode: boolean): { payload: Buffer; signature: string } {
    const payload = JSON.stringify({
      id: 'evt_test_1',
      object: 'event',
      type: 'invoice.paid',
      livemode,
      data: { object: {} },
    });
    return {
      payload: Buffer.from(payload),
      signature: signer.webhooks.generateTestHeaderString({ payload, secret }),
    };
  }

  it('accepts an event of its own mode', () => {
    const { payload, signature } = signed(false);
    expect(service('test').constructWebhookEvent(payload, signature).id).toBe(
      'evt_test_1',
    );
  });

  it('refuses a correctly signed event from the other mode', () => {
    const live = signed(true);
    expect(() =>
      service('test').constructWebhookEvent(live.payload, live.signature),
    ).toThrow(/livemode=true, this deployment is test/);

    const test = signed(false);
    expect(() =>
      service('live').constructWebhookEvent(test.payload, test.signature),
    ).toThrow(/livemode=false, this deployment is live/);
  });
});
