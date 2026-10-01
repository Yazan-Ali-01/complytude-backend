import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClauseItemDto } from './clause.dto';

const CLAUSE = {
  id: 'flr_art_8',
  title: 'Employment contract',
  content: 'The text of the article, exactly as published.',
  order: 1,
  is_required: true,
  article: 'Art. 8',
  section: 'Chapter Two',
  severity: 'high',
  source_title: 'Federal Decree-Law No. 33 of 2021',
  source_url: 'https://uaelegislation.gov.ae/en',
  effective_date: '2022-02-02',
  guidance: 'What the article requires, in plain words.',
};

async function invalidFields(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(ClauseItemDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('ClauseItemDto', () => {
  it('accepts a clause with its source, article and guidance, and one without them', async () => {
    expect(await invalidFields(CLAUSE)).toEqual([]);
    const { id, title, content, order, is_required } = CLAUSE;
    expect(
      await invalidFields({ id, title, content, order, is_required }),
    ).toEqual([]);
  });

  it.each([
    ['severity', { severity: 'urgent' }],
    ['source_url', { source_url: 'http://uaelegislation.gov.ae/en' }],
    ['source_url', { source_url: 'uaelegislation.gov.ae' }],
    ['effective_date', { effective_date: '2022-02-30' }],
    ['effective_date', { effective_date: '2022-02-02T00:00:00Z' }],
    ['article', { article: '' }],
    ['guidance', { guidance: 'x'.repeat(2001) }],
  ])('refuses a bad %s', async (field, override) => {
    expect(await invalidFields({ ...CLAUSE, ...override })).toEqual([field]);
  });
});
