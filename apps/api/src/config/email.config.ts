import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
  provider: process.env.EMAIL_PROVIDER || 'resend',
  apiKey: process.env.EMAIL_API_KEY || '',
  from: process.env.EMAIL_FROM || 'noreply@complytude.com',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  skipSend:
    process.env.EMAIL_SKIP_SEND === 'true' ||
    !(process.env.EMAIL_API_KEY || '').trim(),
}));
