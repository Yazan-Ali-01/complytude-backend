import {
  createQuoteLocator,
  MAX_QUOTE_CHARS,
  normalizeWithMap,
} from './evidence';

const CONTRACT = [
  '4. WORKING HOURS',
  'The Employee shall work ten (10) hours per day,',
  '    six (6) days per week.',
  '5. The Company’s “standard” schedule applies — no overtime.',
  'يلتزم صاحبُ العملِ بدفعِ الأجرِ الشهري.',
].join('\n');

describe('evidence quotes', () => {
  const locate = createQuoteLocator(CONTRACT);

  function quoted(quote: string): string | null {
    const span = locate(quote);
    return span ? CONTRACT.slice(span.start, span.end) : null;
  }

  it('finds a verbatim quote and returns its exact place in the contract', () => {
    const span = locate('The Employee shall work ten (10) hours per day,');
    expect(span).toEqual({
      start: CONTRACT.indexOf('The Employee'),
      end: CONTRACT.indexOf('The Employee') + 47,
    });
  });

  it('ignores line breaks, spacing and case, but returns the original text', () => {
    expect(
      quoted(
        'the employee shall work ten (10) hours per day, six (6) days per week.',
      ),
    ).toBe(
      'The Employee shall work ten (10) hours per day,\n    six (6) days per week.',
    );
  });

  it('matches straight quotes and hyphens against typographic ones', () => {
    expect(
      quoted(`The Company's "standard" schedule applies - no overtime.`),
    ).toBe('The Company’s “standard” schedule applies — no overtime.');
  });

  it('matches Arabic quoted without diacritics', () => {
    expect(quoted('يلتزم صاحب العمل بدفع الأجر الشهري')).toBe(
      'يلتزم صاحبُ العملِ بدفعِ الأجرِ الشهري',
    );
  });

  it('refuses a quote that is not in the contract, or too short or long to mean anything', () => {
    expect(
      locate('The Employee shall work eight (8) hours per day'),
    ).toBeNull();
    expect(locate('hours')).toBeNull();
    expect(locate(CONTRACT.repeat(2).slice(0, MAX_QUOTE_CHARS + 1))).toBeNull();
  });

  it('maps every normalised character back to the original text', () => {
    const { text, map } = normalizeWithMap('  A\u00A0 B\nc  ');
    expect(text).toBe('a b c');
    expect(map).toEqual([2, 3, 5, 6, 7]);
  });
});
