import {
  GetDocumentAnalysisCommand,
  StartDocumentAnalysisCommand,
  type TextractClient,
} from '@aws-sdk/client-textract';
import { PermanentError } from '@lib/queue';
import type { S3Service } from '@lib/storage';
import type { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { TextractJobFailedError } from '../interfaces/textract.interface';
import { TextractService } from './textract.service';

async function pdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return Buffer.from(await doc.save());
}

function service(file: Buffer, textractSend: jest.Mock): TextractService {
  const config = {
    get: (key: string, fallback: unknown) =>
      key === 'textract.maxPages'
        ? 50
        : key === 'textract.pollInitialDelayMs'
          ? 0
          : fallback,
  } as unknown as ConfigService;
  return new TextractService(
    { send: textractSend } as unknown as TextractClient,
    {
      getObjectBuffer: jest.fn().mockResolvedValue(file),
    } as unknown as S3Service,
    config,
  );
}

const sentCommands = (send: jest.Mock): string[] =>
  send.mock.calls.map(([command]: [object]) => command.constructor.name);

describe('TextractService', () => {
  it('refuses a PDF over the page limit without starting (or paying for) a Textract job', async () => {
    const send = jest.fn();

    await expect(
      service(await pdf(51), send).startAnalysis(
        'quarantine',
        'doc.pdf',
        'application/pdf',
      ),
    ).rejects.toThrow(PermanentError);

    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a file that claims to be a PDF but is not one', async () => {
    const send = jest.fn();

    await expect(
      service(Buffer.from('not a pdf'), send).startAnalysis(
        'quarantine',
        'doc.pdf',
        'application/pdf',
      ),
    ).rejects.toThrow(PermanentError);
    expect(send).not.toHaveBeenCalled();
  });

  it('starts one job for a PDF within the limit', async () => {
    const send = jest.fn().mockResolvedValue({ JobId: 'job-1' });

    await expect(
      service(await pdf(50), send).startAnalysis(
        'quarantine',
        'doc.pdf',
        'application/pdf',
      ),
    ).resolves.toBe('job-1');

    expect(sentCommands(send)).toEqual([StartDocumentAnalysisCommand.name]);
  });

  it('reports a failed or expired job as one that has to be replaced', async () => {
    const failed = jest
      .fn()
      .mockResolvedValue({ JobStatus: 'FAILED', StatusMessage: 'bad file' });
    await expect(
      service(await pdf(1), failed).collectResult('job-1'),
    ).rejects.toBeInstanceOf(TextractJobFailedError);
    expect(sentCommands(failed)).toEqual([GetDocumentAnalysisCommand.name]);

    const expired = jest.fn().mockRejectedValue(
      Object.assign(new Error('Job not found'), {
        name: 'InvalidJobIdException',
      }),
    );
    await expect(
      service(await pdf(1), expired).collectResult('job-1'),
    ).rejects.toBeInstanceOf(TextractJobFailedError);
  });
});
