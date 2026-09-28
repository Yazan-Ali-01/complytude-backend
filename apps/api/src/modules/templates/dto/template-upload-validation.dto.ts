import { ApiProperty } from '@nestjs/swagger';

/**
 * How an uploaded DOCX's placeholders compare with the submitted field definitions
 */
export class TemplateUploadValidationDto {
  @ApiProperty({
    description:
      'True when every placeholder has a field and every field is used',
    example: true,
  })
  isValid: boolean;

  @ApiProperty({
    description:
      'Placeholders in the DOCX with no field definition (fine for system variables)',
    example: [],
    type: [String],
  })
  missingInFields: string[];

  @ApiProperty({
    description: 'Field definitions the DOCX never uses',
    example: [],
    type: [String],
  })
  missingInTemplate: string[];

  @ApiProperty({
    description: 'Placeholders with a matching field definition',
    example: ['employee_name', 'salary'],
    type: [String],
  })
  matches: string[];
}
