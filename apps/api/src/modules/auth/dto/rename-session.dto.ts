import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * DTO for renaming a session
 */
export class RenameSessionDto {
  @ApiProperty({
    description: 'New session name (user-customizable)',
    example: 'My MacBook Pro',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sessionName: string;
}
