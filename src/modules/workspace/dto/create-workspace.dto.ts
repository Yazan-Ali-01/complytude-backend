import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class WorkspaceFeaturesDto {
  @ApiProperty({ example: 5, description: 'Maximum number of documents' })
  @IsNotEmpty()
  document_limit: number;

  @ApiProperty({ example: true, description: 'Access to checklist feature' })
  @IsNotEmpty()
  checklist_access: boolean;

  @ApiProperty({ example: true, description: 'Analyzer feature enabled' })
  @IsNotEmpty()
  analyzer_enabled: boolean;
}

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'user@example.com', description: 'Workspace email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'early_access',
    enum: ['early_access', 'basic', 'pro', 'enterprise'],
    description: 'Subscription plan',
  })
  @IsEnum(['early_access', 'basic', 'pro', 'enterprise'])
  @IsNotEmpty()
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise';

  @ApiProperty({
    type: WorkspaceFeaturesDto,
    description: 'Feature configuration',
  })
  @IsObject()
  @ValidateNested()
  @Type(() => WorkspaceFeaturesDto)
  features: WorkspaceFeaturesDto;
}
