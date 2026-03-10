import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { I18nService } from 'nestjs-i18n';
import { TEMPLATE_PLACEHOLDER_DELIMITERS } from '../constants/template.constants';
import { TemplatesI18n } from '../constants/i18n.constants';
import { TemplateFieldItemDto } from '../dto/template-field.dto';

/**
 * Result of validating placeholders against field definitions.
 */
export interface PlaceholderValidationResult {
  /** Placeholders that have matching field definitions */
  matched: string[];
  /** User-friendly warning messages */
  warnings: string[];
  /** Placeholders without field definitions */
  unmatchedPlaceholders: string[];
  /** Field definitions without placeholders */
  unusedFields: string[];
}

/**
 * Service responsible for extracting placeholder variables from DOCX template files.
 *
 * DOCX files are ZIP archives containing XML. This service parses word/document.xml
 * to find all placeholder patterns in the format {variable_name}.
 *
 * @example
 * const placeholders = await service.extractPlaceholders(docxBuffer);
 * // Returns: ["employee_name", "salary", "start_date"]
 */
@Injectable()
export class DocxPlaceholderExtractionService {
  private readonly logger = new Logger(DocxPlaceholderExtractionService.name);

  constructor(private readonly i18n: I18nService) {}

  /**
   * Extracts unique placeholder variables from a DOCX file buffer.
   *
   * Note: This method is async (even if the current flow is mostly sync) to ensure future compatibility,
   * since future versions of PizZip or docx parsers might support asynchronous APIs or options.
   *
   * Process:
   * 1. Unzip DOCX file using PizZip
   * 2. Extract word/document.xml from ZIP archive
   * 3. Parse XML content using regex to find placeholders
   * 4. Deduplicate and return unique placeholder keys
   *
   * @param buffer - DOCX file as Buffer
   * @returns Promise<string[]> - Array of unique placeholder keys (without braces)
   * @throws BadRequestException if file is invalid, corrupted, or not a valid DOCX
   *
   * @example
   * const buffer = fs.readFileSync('template.docx');
   * const placeholders = await extractPlaceholders(buffer);
   * // Returns: ["employee_name", "salary"]
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async extractPlaceholders(buffer: Buffer): Promise<string[]> {
    try {
      this.logger.log('Starting placeholder extraction from DOCX file');

      if (!buffer || buffer.length === 0) {
        throw new BadRequestException(
          this.i18n.t(TemplatesI18n.errors.EMPTY_OR_INVALID_FILE_BUFFER),
        );
      }

      let zip: PizZip;
      try {
        zip = new PizZip(buffer);
      } catch (error) {
        this.logger.error('Failed to unzip DOCX file', error);
        throw new BadRequestException(
          this.i18n.t(TemplatesI18n.errors.INVALID_DOCX_FORMAT),
        );
      }

      const placeholders = new Set<string>();

      const doc = new Docxtemplater(zip, {
        delimiters: TEMPLATE_PLACEHOLDER_DELIMITERS,
        parser: (tag) => {
          placeholders.add(tag);
          return {
            get: () => '',
          };
        },
      });

      doc.render();

      return Array.from(placeholders);
    } catch (error) {
      // Re-throw BadRequestException as-is
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Log and wrap unexpected errors
      this.logger.error(
        'Unexpected error during placeholder extraction',
        error,
      );
      throw new BadRequestException(
        this.i18n.t(TemplatesI18n.errors.FAILED_TO_EXTRACT_PLACEHOLDERS),
      );
    }
  }

  /**
   * Validates if a placeholder name follows the correct naming convention.
   *
   * Rules:
   * - Must contain only alphanumeric characters and underscores
   * - Cannot be empty
   * - Cannot contain spaces or special characters
   *
   * @param placeholder - Placeholder name to validate (without braces)
   * @returns boolean - True if valid, false otherwise
   *
   * @example
   * validatePlaceholderFormat('employee_name') // true
   * validatePlaceholderFormat('employee-name') // false
   * validatePlaceholderFormat('123_valid') // true
   * validatePlaceholderFormat('') // false
   */
  validatePlaceholderFormat(placeholder: string): boolean {
    return /^[a-zA-Z0-9_]+$/.test(placeholder ?? '');
  }

  /**
   * Validates placeholders against field definitions and generates warnings.
   *
   * This method compares extracted DOCX placeholders with provided field definitions
   * to identify mismatches. It returns warnings (not errors) because:
   * - System variables like {generated_date}, {document_id} are auto-injected
   * - Context variables like {user_email}, {company_name} come from user session
   * - Calculated fields like {annual_salary} are derived from other inputs
   * - Admins may intentionally add placeholders for future fields
   * - Conditional placeholders may only be used in specific document variations
   *
   * @param placeholders - Array of placeholder keys extracted from DOCX (without braces)
   * @param fields - Array of field definitions provided by admin
   * @returns Validation result with matched placeholders, warnings, and mismatches
   *
   * @example
   * const result = service.validateFieldsMatchPlaceholders(
   *   ['employee_name', 'salary', 'start_date'],
   *   [{key: 'employee_name', ...}, {key: 'salary', ...}]
   * );
   * // Returns:
   * // {
   * //   matched: ['employee_name', 'salary'],
   * //   unmatchedPlaceholders: ['start_date'],
   * //   unusedFields: [],
   * //   warnings: ['Placeholder {start_date} found in DOCX but no field definition provided...']
   * // }
   */
  validateFieldsMatchPlaceholders(
    placeholders: string[],
    fields: TemplateFieldItemDto[],
  ): PlaceholderValidationResult {
    // Extract field keys from field definitions
    const fieldKeys = fields.map((field) => field.key);

    // Convert to sets for efficient lookup
    const placeholderSet = new Set(placeholders);
    const fieldKeySet = new Set(fieldKeys);

    // Find matched placeholders (in both DOCX and field definitions)
    const matched = placeholders.filter((placeholder) =>
      fieldKeySet.has(placeholder),
    );

    // Find unmatched placeholders (in DOCX but not in field definitions)
    const unmatchedPlaceholders = placeholders.filter(
      (placeholder) => !fieldKeySet.has(placeholder),
    );

    // Find unused fields (in field definitions but not in DOCX)
    const unusedFields = fieldKeys.filter(
      (fieldKey) => !placeholderSet.has(fieldKey),
    );

    // Generate user-friendly warning messages
    const warnings: string[] = [];

    // Warnings for unmatched placeholders
    unmatchedPlaceholders.forEach((placeholder) => {
      warnings.push(
        `Placeholder {${placeholder}} found in DOCX but no field definition provided. ` +
          `This is OK if it's a system variable (e.g., generated_date, document_id, tenant_name) ` +
          `or context variable. Otherwise, add a field definition.`,
      );
    });

    // Warnings for unused fields
    unusedFields.forEach((fieldKey) => {
      warnings.push(
        `Field '${fieldKey}' defined but not used in DOCX template. ` +
          `This field will be ignored during document generation.`,
      );
    });

    this.logger.log(
      `Validation complete: ${matched.length} matched, ${unmatchedPlaceholders.length} unmatched placeholders, ${unusedFields.length} unused fields`,
    );

    return {
      matched,
      warnings,
      unmatchedPlaceholders,
      unusedFields,
    };
  }
}
