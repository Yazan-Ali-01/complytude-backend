import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CheckPermissionDto {
  @ApiProperty({ description: 'Permission name to check', example: 'documents:create' })
  @IsString()
  permission: string;
}

export class PermissionResponseDto {
  @ApiProperty({ description: 'Permission ID' })
  id: string;

  @ApiProperty({ description: 'Permission name', example: 'documents:create' })
  name: string;

  @ApiProperty({ description: 'Resource type', example: 'documents' })
  resource: string;

  @ApiProperty({ description: 'Action type', example: 'create' })
  action: string;

  @ApiProperty({ description: 'Permission description', nullable: true })
  description: string | null;

  @ApiProperty({ description: 'When permission was created' })
  created_at: Date;

  @ApiProperty({ description: 'When permission was last updated' })
  updated_at: Date;
}

export class PermissionListResponseDto {
  @ApiProperty({ type: [PermissionResponseDto], description: 'List of permissions' })
  permissions: PermissionResponseDto[];
}