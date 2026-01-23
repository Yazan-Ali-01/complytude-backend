import { ApiProperty } from '@nestjs/swagger';

export class RegulatoryQueryDto {
  @ApiProperty()
  query: string;

  @ApiProperty()
  jurisdiction?: string;
}

export class LicenseVerifierDto {
  @ApiProperty()
  licenseNumber: string;

  @ApiProperty()
  issuer?: string;
}

export class RegulatoryQueryResponseDto {
  @ApiProperty()
  answer: string;

  @ApiProperty()
  sources: any[];
}

export class LicenseVerifierResponseDto {
  @ApiProperty()
  isValid: boolean;

  @ApiProperty()
  licenseInfo: any;

  @ApiProperty()
  status: string;
}
