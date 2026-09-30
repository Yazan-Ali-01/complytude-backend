import { RetryableError } from '@lib/queue';
import { ConfigService } from '@nestjs/config';
import { OcrOperationLostError } from '../interfaces/ocr.interface';
import type {
  AnalyzeOperation,
  DocumentIntelligenceClient,
} from './document-intelligence.client';
import { DocumentIntelligenceService } from './document-intelligence.service';

const SUCCEEDED: AnalyzeOperation = {
  status: 'succeeded',
  analyzeResult: {
    pages: [{ pageNumber: 1 }],
    paragraphs: [
      {
        content: 'Salary is AED 18,000 per month.',
        boundingRegions: [{ pageNumber: 1 }],
        spans: [{ offset: 0, length: 31 }],
      },
    ],
  },
};

describe('DocumentIntelligenceService', () => {
  let client: jest.Mocked<
    Pick<DocumentIntelligenceClient, 'analyze' | 'getResult' | 'deleteResult'>
  >;

  function service(pollMaxAttempts = 5): DocumentIntelligenceService {
    return new DocumentIntelligenceService(
      client as unknown as DocumentIntelligenceClient,
      new ConfigService({ ocr: { pollInitialDelayMs: 0, pollMaxAttempts } }),
    );
  }

  beforeEach(() => {
    client = {
      analyze: jest.fn().mockResolvedValue('result-1'),
      getResult: jest.fn(),
      deleteResult: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('starts an analysis of the PDF it is given', async () => {
    const pdf = new Uint8Array([1, 2, 3]);

    await expect(service().start(pdf)).resolves.toBe('result-1');
    expect(client.analyze).toHaveBeenCalledWith(pdf);
  });

  it('polls until the analysis succeeds, parses it, then deletes the result', async () => {
    client.getResult
      .mockResolvedValueOnce({ status: 'notStarted' })
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce(SUCCEEDED);

    await expect(service().collect('result-1')).resolves.toEqual({
      items: [
        { kind: 'text', text: 'Salary is AED 18,000 per month.', page: 1 },
      ],
      pageCount: 1,
      confidence: undefined,
    });
    expect(client.getResult).toHaveBeenCalledTimes(3);
    expect(client.deleteResult).toHaveBeenCalledWith('result-1');
    expect(client.deleteResult.mock.invocationCallOrder[0]).toBeGreaterThan(
      client.getResult.mock.invocationCallOrder[2],
    );
  });

  it('still returns the text when the result cannot be deleted (it expires in 24 hours)', async () => {
    client.getResult.mockResolvedValue(SUCCEEDED);
    client.deleteResult.mockRejectedValue(new RetryableError('HTTP 503'));

    await expect(service().collect('result-1')).resolves.toMatchObject({
      pageCount: 1,
    });
  });

  it('reports a failed analysis as one to start again', async () => {
    client.getResult.mockResolvedValue({
      status: 'failed',
      error: { code: 'InternalServerError', message: 'An unexpected error' },
    });

    await expect(service().collect('result-1')).rejects.toBeInstanceOf(
      OcrOperationLostError,
    );
    expect(client.deleteResult).not.toHaveBeenCalled();
  });

  it('reports a result that is gone as one to start again', async () => {
    client.getResult.mockRejectedValue(
      new OcrOperationLostError('no result result-1'),
    );

    await expect(service().collect('result-1')).rejects.toBeInstanceOf(
      OcrOperationLostError,
    );
  });

  it('gives up polling with a retry that resumes the same analysis', async () => {
    client.getResult.mockResolvedValue({ status: 'running' });

    const error = await service(3)
      .collect('result-1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RetryableError);
    expect(error).not.toBeInstanceOf(OcrOperationLostError);
    expect(client.getResult).toHaveBeenCalledTimes(3);
  });
});
