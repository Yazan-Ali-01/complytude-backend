import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeContractDto {
  @ApiProperty()
  fileName: string;

  @ApiProperty()
  content: string;
}

export class RedlineContractDto {
  @ApiProperty()
  fileName: string;

  @ApiProperty()
  content: string;
}

export class ReviewContractDto {
  @ApiProperty()
  fileName: string;

  @ApiProperty()
  content: string;
}

export class LocalizerCheckDto {
  @ApiProperty()
  fileName: string;

  @ApiProperty()
  content: string;
}

export class ContractAnalysisResponseDto {
  @ApiProperty()
  risks: any[];

  @ApiProperty()
  summary: string;
}

export class RedlineResponseDto {
  @ApiProperty()
  suggestions: any[];

  @ApiProperty()
  originalClause: string;

  @ApiProperty()
  suggestedClause: string;
}
