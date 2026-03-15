import { registerAs } from '@nestjs/config';

export default registerAs('stripe', () => ({
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  skipCustomerCreation:
    process.env.STRIPE_SKIP_CUSTOMER_CREATION === 'true' ||
    !(process.env.STRIPE_SECRET_KEY || '').trim(),
}));
