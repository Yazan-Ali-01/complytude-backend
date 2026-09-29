import { attachmentDisposition } from './storage.service';

describe('attachmentDisposition', () => {
  it('keeps an ASCII name as it is', () => {
    expect(attachmentDisposition('lease 2026.pdf')).toBe(
      `attachment; filename="lease 2026.pdf"; filename*=UTF-8''lease%202026.pdf`,
    );
  });

  it('gives an Arabic name exactly in filename*, with an ASCII fallback', () => {
    const header = attachmentDisposition('عقد.pdf');

    expect(header).toBe(
      `attachment; filename="___.pdf"; filename*=UTF-8''${encodeURIComponent('عقد.pdf')}`,
    );
    expect(decodeURIComponent(header.split("UTF-8''")[1])).toBe('عقد.pdf');
  });

  it('cannot be used to break out of the header value', () => {
    const header = attachmentDisposition('a"; filename="evil.html\r\nX: y');

    expect(header).not.toMatch(/[\r\n]/);
    expect(
      header.startsWith(
        'attachment; filename="a_; filename=_evil.html__X: y";',
      ),
    ).toBe(true);
  });
});
