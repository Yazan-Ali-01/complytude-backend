import { registerAs } from '@nestjs/config';

export default registerAs('stripe', () => ({
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  apiVersion: '2026-02-25.clover',
  taxEnabled: process.env.STRIPE_TAX_ENABLED === 'true',
  catalogSyncEnabled: process.env.STRIPE_CATALOG_SYNC_ENABLED === 'true',
}));
