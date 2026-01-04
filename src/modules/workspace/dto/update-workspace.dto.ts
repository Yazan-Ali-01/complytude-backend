import { PartialType } from '@nestjs/swagger';
import { CreateWorkspaceDto } from './create-workspace.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWorkspaceDto extends PartialType(CreateWorkspaceDto) {
  @ApiPropertyOptional({
    example: true,
    description: 'Workspace active status',
  })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
