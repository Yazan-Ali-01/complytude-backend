import { ConfigService } from '@nestjs/config';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  emiratesIds,
  ibanValid,
  ibans,
  luhnValid,
  parties,
  passports,
  phones,
} from './detectors';
import { RedactionError, RedactionService } from './redaction.service';
import { redact } from './redactor';

/** Synthetic personal data only; the ID and IBAN carry valid check digits. */
const CONTRACT = [
  'EMPLOYMENT AGREEMENT',
  '',
  'BETWEEN:',
  'Falcon Logistics LLC, a company registered in Dubai, UAE ("Employer")',
  '',
  'AND:',
  'Mariam Khalid Al Suwaidi, UAE national, Emirates ID 784-1990-1234567-6, Passport No. N1234567 ("Employee")',
  '',
  '1. The Employee lives at Villa 12, Street 5, Al Barsha, Dubai; P.O. Box 55555.',
  '2. Contact: mariam.suwaidi@example.com, +971 50 123 4567, 04 321 7654.',
  '3. A salary of AED 18,000 is paid on the 25th of each month to IBAN AE07 0331 2345 6789 0123 456.',
  '4. The Employee shall work 60 hours a week, reporting to Mr. Rashid Al Mansoori.',
  '5. Ms. Al Suwaidi may not take leave in her first year.',
  '6. يعمل السيد أحمد محمد الهاشمي مشرفاً على الموظفة.',
  'Name: Layla Haddad',
  '',
  'Falcon Logistics LLC            Mariam Khalid Al Suwaidi',
].join('\n');

const PERSONAL = [
  'Falcon Logistics',
  'Mariam',
  'Suwaidi',
  '784-1990-1234567-6',
  'N1234567',
  'Villa 12',
  '55555',
  'mariam.suwaidi@example.com',
  '123 4567',
  '321 7654',
  'AE07 0331',
  'Rashid',
  'Mansoori',
  'أحمد محمد الهاشمي',
  'Layla Haddad',
];

describe('redaction', () => {
  describe('detectors', () => {
    it('validates Emirates IDs by their check digit, and masks the hyphenated shape when partly hidden', () => {
      expect(luhnValid('784199012345676')).toBe(true);
      expect(luhnValid('784199012345677')).toBe(false);
      const text =
        'IDs 784-1990-1234567-6, 784199012345677 and 784-1990-XXXXXXX-X';
      expect(emiratesIds(text).map((s) => text.slice(s.start, s.end))).toEqual([
        '784-1990-1234567-6',
        '784-1990-XXXXXXX-X',
      ]);
    });

    it('validates IBANs with mod-97', () => {
      expect(ibanValid('AE07 0331 2345 6789 0123 456')).toBe(true);
      expect(ibanValid('AE08 0331 2345 6789 0123 456')).toBe(false);
      expect(ibans('Pay to AE08 0331 2345 6789 0123 456 now')).toEqual([]);
    });

    it('finds phone numbers but not amounts, dates or references', () => {
      const text =
        'Call +971 50 123 4567 or 04 321 7654. AED 250,000 on 2026-03-15, ref SVC-2026-1187, 0.25 per cent';
      expect(phones(text).map((s) => text.slice(s.start, s.end))).toEqual([
        '+971 50 123 4567',
        '04 321 7654',
      ]);
    });

    it('takes the passport number after the word, not an ordinary word', () => {
      const text =
        'Passport No. GB-XXXXXXXX; passport holder; جواز السفر رقم A1234567';
      expect(passports(text).map((s) => text.slice(s.start, s.end))).toEqual([
        'GB-XXXXXXXX',
        'A1234567',
      ]);
    });

    it('finds the parties the preamble defines, with their roles', () => {
      expect(
        parties(CONTRACT).map((s) => [CONTRACT.slice(s.start, s.end), s.role]),
      ).toEqual([
        ['Falcon Logistics LLC', 'Employer'],
        ['Mariam Khalid Al Suwaidi', 'Employee'],
      ]);
      const defined =
        'This Agreement ("Agreement") covers Payment of Fees ("Fees")';
      expect(parties(defined)).toEqual([]);
    });
  });

  describe('redactor', () => {
    const redaction = redact(CONTRACT);

    it('leaves no personal data in the redacted text', () => {
      for (const value of PERSONAL) {
        expect(redaction.text).not.toContain(value);
      }
    });

    it('keeps what the rules test: amounts, dates, durations, hours, places of registration', () => {
      for (const kept of [
        'AED 18,000',
        '25th of each month',
        '60 hours a week',
        'first year',
        'registered in Dubai, UAE',
        '("Employee")',
      ]) {
        expect(redaction.text).toContain(kept);
      }
    });

    it('uses role placeholders for parties, the same one everywhere, and keeps the legal form', () => {
      expect(redaction.text).toContain(
        '[EMPLOYER] LLC, a company registered in Dubai',
      );
      expect(redaction.text).toContain('[EMPLOYER] LLC            [EMPLOYEE]');
      expect(redaction.text).toContain('Ms. [EMPLOYEE_SURNAME] may not');
      expect(redaction.text).toContain('Mr. [PERSON_1].');
      expect(redaction.entities.get('[EMPLOYEE]')).toBe(
        'Mariam Khalid Al Suwaidi',
      );
    });

    it('re-hydrates placeholders to the exact original text', () => {
      expect(
        redaction.rehydrate(
          '[EMPLOYER] makes [EMPLOYEE] work 60 hours; Ms. [EMPLOYEE_SURNAME]; [UNKNOWN_9] stays',
        ),
      ).toBe(
        'Falcon Logistics makes Mariam Khalid Al Suwaidi work 60 hours; Ms. Al Suwaidi; [UNKNOWN_9] stays',
      );
    });

    it('maps a span of the redacted text back to the original, placeholders included', () => {
      const quote = 'Ms. [EMPLOYEE_SURNAME] may not take leave';
      const start = redaction.text.indexOf(quote);
      const at = redaction.toOriginal(start, start + quote.length);
      expect(CONTRACT.slice(at.start, at.end)).toBe(
        'Ms. Al Suwaidi may not take leave',
      );
      const plain = 'shall work 60 hours a week';
      const p = redaction.text.indexOf(plain);
      const back = redaction.toOriginal(p, p + plain.length);
      expect(CONTRACT.slice(back.start, back.end)).toBe(plain);
    });
  });

  describe('RedactionService', () => {
    let server: Server;
    let url: string;
    let answer: (text: string) => { status: number; body: unknown };

    beforeAll(async () => {
      server = createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
        req.on('end', () => {
          const { text } = JSON.parse(raw) as { text: string };
          const { status, body } = answer(text);
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(body));
        });
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      await new Promise((done) => server.close(done));
    });

    function service(values: Record<string, unknown>): RedactionService {
      return new RedactionService(
        new ConfigService({ workerAi: { redactionEnabled: true, ...values } }),
      );
    }

    it('masks a name only the name-recognition service finds', async () => {
      const text = 'The report goes to Yousef Karim every week.';
      answer = (t) => ({
        status: 200,
        body: [
          {
            entity_type: 'PERSON',
            start: t.indexOf('Yousef'),
            end: t.indexOf('Yousef') + 'Yousef Karim'.length,
            score: 0.85,
          },
          { entity_type: 'LOCATION', start: 0, end: 3, score: 0.9 },
        ],
      });

      const redaction = await service({ redactionNerUrl: url }).redact(text);

      expect(redaction.text).toBe('The report goes to [PERSON_1] every week.');
    });

    it('fails closed when the name-recognition service errs or is unreachable', async () => {
      answer = () => ({ status: 500, body: { error: 'model not loaded' } });
      await expect(
        service({ redactionNerUrl: url }).redact('Ahmed signs.'),
      ).rejects.toBeInstanceOf(RedactionError);
      await expect(
        service({
          redactionNerUrl: 'http://127.0.0.1:9',
          redactionNerTimeoutMs: 500,
        }).redact('Ahmed signs.'),
      ).rejects.toBeInstanceOf(RedactionError);
    });

    it('passes text through untouched only when redaction is off', async () => {
      const off = await service({ redactionEnabled: false }).redact(CONTRACT);
      expect(off.text).toBe(CONTRACT);
      const on = await service({}).redact(CONTRACT);
      expect(on.text).not.toContain('Mariam');
    });
  });
});
