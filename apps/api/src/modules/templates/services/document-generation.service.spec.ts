import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import { I18nService } from 'nestjs-i18n';
import PizZip from 'pizzip';
import { Readable } from 'stream';
import { StorageService } from '../../storage/storage.service';
import { TemplatesI18n } from '../constants/i18n.constants';
import { DocumentGenerationService } from './document-generation.service';

// ---------------------------------------------------------------------------
// Minimal DOCX builder — creates a well-formed DOCX ZIP in memory so tests
// do not rely on any file on disk.
// ---------------------------------------------------------------------------

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`;

const WORD_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

function buildDocumentXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${body}</w:t></w:r></w:p>
  </w:body>
</w:document>`;
}

function makeDocxBuffer(body: string): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', ROOT_RELS_XML);
  zip.file('word/document.xml', buildDocumentXml(body));
  zip.file('word/_rels/document.xml.rels', WORD_RELS_XML);
  return zip.generate({ type: 'nodebuffer' });
}

/** Read document.xml text out of a rendered DOCX buffer. */
function readDocumentXml(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return zip.files['word/document.xml'].asText();
}

/** Build a Readable stream that emits the given buffer in two chunks. */
function bufferToStream(buf: Buffer): Readable {
  const stream = new Readable({ read() {} });
  stream.push(buf.slice(0, Math.ceil(buf.length / 2)));
  stream.push(buf.slice(Math.ceil(buf.length / 2)));
  stream.push(null);
  return stream;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('DocumentGenerationService', () => {
  let service: DocumentGenerationService;
  let mockStorageService: jest.Mocked<Pick<StorageService, 'getTemplateFile'>>;

  beforeEach(() => {
    mockStorageService = {
      getTemplateFile: jest.fn(),
    };
    service = new DocumentGenerationService(
      mockStorageService as unknown as StorageService,
      { t: (key: string) => key } as unknown as I18nService,
    );
  });

  // -------------------------------------------------------------------------
  // renderBuffer — pure synchronous rendering
  // -------------------------------------------------------------------------
  describe('renderBuffer', () => {
    it('replaces a single template tag with the provided variable', () => {
      const buf = makeDocxBuffer('Hello {{employee_name}}!');
      const output = service.renderBuffer(buf, { employee_name: 'Alice' });
      expect(readDocumentXml(output)).toContain('Alice');
    });

    it('replaces multiple template tags with their respective values', () => {
      const buf = makeDocxBuffer('{{first}} {{last}} earns {{salary}}');
      const output = service.renderBuffer(buf, {
        first: 'Bob',
        last: 'Smith',
        salary: '50,000.00 AED',
      });
      const xml = readDocumentXml(output);
      expect(xml).toContain('Bob');
      expect(xml).toContain('Smith');
      expect(xml).toContain('50,000.00 AED');
    });

    it('returns empty string for a tag that has no matching variable (nullGetter)', () => {
      const buf = makeDocxBuffer('Name: {{missing_var}}');
      const output = service.renderBuffer(buf, {});
      const xml = readDocumentXml(output);
      // The tag is removed / replaced with empty string — the literal tag text
      // must not appear in the rendered output.
      expect(xml).not.toContain('{{missing_var}}');
      expect(xml).not.toContain('missing_var');
    });

    it('returns empty string when a variable value is null', () => {
      const buf = makeDocxBuffer('Value: {{field}}');
      const output = service.renderBuffer(buf, {
        field: null as unknown as string,
      });
      const xml = readDocumentXml(output);
      expect(xml).not.toContain('{{field}}');
    });

    it('returns empty string when a variable value is undefined', () => {
      const buf = makeDocxBuffer('Value: {{field}}');
      const output = service.renderBuffer(buf, { field: undefined });
      const xml = readDocumentXml(output);
      expect(xml).not.toContain('{{field}}');
    });

    it('returns a Buffer', () => {
      const buf = makeDocxBuffer('Content');
      const output = service.renderBuffer(buf, {});
      expect(Buffer.isBuffer(output)).toBe(true);
      expect(output.length).toBeGreaterThan(0);
    });

    it('output is a valid ZIP / DOCX that can be re-opened with PizZip', () => {
      const buf = makeDocxBuffer('{{name}}');
      const output = service.renderBuffer(buf, { name: 'Test' });
      expect(() => new PizZip(output)).not.toThrow();
    });

    it('output produced by Docxtemplater is re-parseable by Docxtemplater itself', () => {
      const buf = makeDocxBuffer('{{value}}');
      const output = service.renderBuffer(buf, { value: 'hello' });
      expect(() => {
        const zip = new PizZip(output);
        new Docxtemplater(zip, {
          delimiters: { start: '{{', end: '}}' },
        });
      }).not.toThrow();
    });

    it('handles an empty variable map (no tags in template)', () => {
      const buf = makeDocxBuffer('No placeholders here');
      const output = service.renderBuffer(buf, {});
      expect(readDocumentXml(output)).toContain('No placeholders here');
    });

    it('preserves non-tag content unchanged', () => {
      const buf = makeDocxBuffer('Fixed text — {{dynamic}}');
      const output = service.renderBuffer(buf, { dynamic: 'replaced' });
      const xml = readDocumentXml(output);
      expect(xml).toContain('Fixed text');
      expect(xml).toContain('replaced');
    });

    it('throws InternalServerErrorException for an empty buffer', () => {
      expect(() => service.renderBuffer(Buffer.alloc(0), {})).toThrow(
        InternalServerErrorException,
      );
    });

    it('throws InternalServerErrorException for a non-ZIP buffer', () => {
      const garbage = Buffer.from('this is not a zip file at all');
      expect(() => service.renderBuffer(garbage, {})).toThrow(
        InternalServerErrorException,
      );
    });

    it('reports an invalid DOCX (translated) for an invalid buffer', () => {
      const garbage = Buffer.from('%%not-a-zip%%');
      let caught: Error | undefined;
      try {
        service.renderBuffer(garbage, {});
      } catch (err) {
        caught = err as Error;
      }
      expect(caught).toBeInstanceOf(InternalServerErrorException);
      const body = (caught as InternalServerErrorException).getResponse() as {
        message: string;
      };
      expect(body.message).toBe(TemplatesI18n.errors.INVALID_DOCX_FORMAT);
    });
  });

  // -------------------------------------------------------------------------
  // render — async pipeline with S3
  // -------------------------------------------------------------------------
  describe('render', () => {
    it('fetches the template from storage and returns a RenderResult', async () => {
      const templateBuf = makeDocxBuffer('Hello {{name}}');
      mockStorageService.getTemplateFile.mockResolvedValue(
        bufferToStream(templateBuf),
      );

      const result = await service.render('tpl-123', '1.0.0', {
        name: 'World',
      });

      expect(mockStorageService.getTemplateFile).toHaveBeenCalledWith(
        'tpl-123',
        '1.0.0',
      );
      expect(result.templateId).toBe('tpl-123');
      expect(result.version).toBe('1.0.0');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(readDocumentXml(result.buffer)).toContain('World');
    });

    it('propagates NotFoundException from StorageService unchanged', async () => {
      mockStorageService.getTemplateFile.mockRejectedValue(
        new NotFoundException('Template file not found'),
      );

      await expect(
        service.render('missing-tpl', '1.0.0', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reassembles a buffer correctly when the stream emits multiple chunks', async () => {
      const templateBuf = makeDocxBuffer('{{a}} and {{b}}');
      // bufferToStream already splits into 2 chunks
      mockStorageService.getTemplateFile.mockResolvedValue(
        bufferToStream(templateBuf),
      );

      const result = await service.render('tpl-1', '2.0.0', {
        a: 'foo',
        b: 'bar',
      });

      const xml = readDocumentXml(result.buffer);
      expect(xml).toContain('foo');
      expect(xml).toContain('bar');
    });

    it('throws InternalServerErrorException when the stream errors', async () => {
      const errorStream = new Readable({ read() {} });
      mockStorageService.getTemplateFile.mockResolvedValue(errorStream);

      const promise = service.render('tpl-2', '1.0.0', {});
      // Emit error after the promise is awaited
      setImmediate(() =>
        errorStream.emit('error', new Error('network failure')),
      );

      await expect(promise).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});
