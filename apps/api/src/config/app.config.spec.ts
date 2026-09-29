import { parseCorsOrigins } from './app.config';

describe('parseCorsOrigins', () => {
  it('trims entries, so a space after a comma still matches', () => {
    expect(
      parseCorsOrigins('https://app.example.com, https://admin.example.com'),
    ).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });

  it('reduces each entry to the origin a browser sends', () => {
    expect(
      parseCorsOrigins(
        'https://app.example.com/,https://x.example.com:8443/path',
      ),
    ).toEqual(['https://app.example.com', 'https://x.example.com:8443']);
  });

  it('drops empty entries', () => {
    expect(parseCorsOrigins(' https://app.example.com ,, ')).toEqual([
      'https://app.example.com',
    ]);
    expect(parseCorsOrigins(undefined)).toEqual([]);
  });
});
