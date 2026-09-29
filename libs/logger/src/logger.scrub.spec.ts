import { ConfigService } from '@nestjs/config';
import pino from 'pino';
import { Writable } from 'node:stream';
import { createPinoConfig } from './logger.config';
import { scrubLogText, scrubLogValue } from './logger.scrub';

const JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJ0eXBlIjoiaW52aXRlIn0.c2lnbmF0dXJlLXZhbHVl';

describe('scrubLogText', () => {
  it('masks email addresses, keeping the first character and the domain', () => {
    expect(
      scrubLogText('Verification email sent: email=Alice.Smith@corp.ae'),
    ).toBe('Verification email sent: email=A***@corp.ae');
  });

  it('removes JWTs, bearer tokens and access-granting query values', () => {
    const scrubbed = scrubLogText(
      `GET /api/v1/auth/invitations/resolve?token=${JWT}&lang=ar ` +
        `callback?code=4/0AX-abc&state=xyz Authorization: Bearer abc.def-123`,
    );

    expect(scrubbed).not.toContain('eyJ');
    expect(scrubbed).not.toContain('4/0AX-abc');
    expect(scrubbed).not.toContain('xyz');
    expect(scrubbed).not.toContain('abc.def-123');
    expect(scrubbed).toContain('lang=ar');
  });
});

describe('scrubLogValue', () => {
  it('scrubs strings inside plain objects and errors, and replaces sensitive keys', () => {
    const scrubbed = scrubLogValue({
      context: 'EmailService',
      dto: { email: 'bob@corp.ae', token: 'secret-token' },
      err: new Error('duplicate key: Key (email)=(bob@corp.ae) already exists'),
    }) as { dto: Record<string, string>; err: { message: string } };

    expect(scrubbed.dto).toEqual({
      email: 'b***@corp.ae',
      token: '[REDACTED]',
    });
    expect(scrubbed.err.message).toContain('b***@corp.ae');
    expect(JSON.stringify(scrubbed)).not.toContain('bob@');
  });

  it('leaves class instances (requests, responses) to their serializers', () => {
    class Request {
      url = '/x?token=abc';
    }
    const request = new Request();
    expect(scrubLogValue({ req: request })).toEqual({ req: request });
  });
});

describe('pino with createPinoConfig', () => {
  function logger(): { log: pino.Logger; lines: () => string } {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done): void {
        chunks.push(chunk.toString());
        done();
      },
    });
    const config = new ConfigService({ NODE_ENV: 'production' });
    const options = createPinoConfig(config, 'test')
      .pinoHttp as pino.LoggerOptions;
    return {
      log: pino({ ...options, transport: undefined }, stream),
      lines: () => chunks.join(''),
    };
  }

  it('never writes a token or a full email address, however it is logged', () => {
    const { log, lines } = logger();

    log.info(`Invitation created for carol@corp.ae with ${JWT}`);
    log.info({ user: { password: 'hunter2' }, token: 'abc' }, 'login');
    log.error({ err: new Error('failed for dave@corp.ae') }, 'send failed');

    const output = lines();
    expect(output).not.toMatch(/carol@|dave@|eyJ|hunter2|"abc"/);
    expect(output).toContain('c***@corp.ae');
  });

  it('logs a request without its secret query values', () => {
    const { lines } = logger();
    const config = createPinoConfig(new ConfigService({}), 'test');
    const serializers = (config.pinoHttp as pino.LoggerOptions).serializers as {
      req: (req: unknown) => { url: string; query: Record<string, unknown> };
    };

    const serialized = serializers.req({
      method: 'GET',
      url: `/api/v1/auth/invitations/resolve?token=${JWT}`,
      query: { token: JWT, page: '2' },
      headers: {},
    });

    expect(serialized.url).not.toContain('eyJ');
    expect(serialized.query).toEqual({ token: '[REDACTED]', page: '2' });
    expect(lines()).toBe('');
  });
});
