import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18n, I18nService } from 'nestjs-i18n';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { CommonI18n } from '../../common/constants';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { DocumentsService } from '../documents/documents.service';
import { SAMPLE_CONTRACTS } from './sample-contracts.constant';

@ApiTags('RAG Mock (Demo)')
@Controller('rag-mock')
@AuthOptions({ tenant: true })
@SwaggerCookieAuth.tenantAccessToken()
export class RagMockController {
  constructor(
    private readonly documentsService: DocumentsService,
    @I18n() private readonly i18n: I18nService,
  ) {}

  @Get('contracts')
  @ApiOperation({
    summary: 'List available sample contracts',
    description:
      'Returns the index, title, and a content preview for each sample contract.',
  })
  @ApiResponse({ status: 200, description: 'List of sample contracts' })
  listContracts() {
    return SAMPLE_CONTRACTS.map((c, i) => ({
      index: i + 1,
      title: c.title,
      contentPreview: c.content.slice(0, 200) + '…',
      contentLength: c.content.length,
    }));
  }

  @Post('analyze/:contractNumber')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:create')
  @ApiOperation({
    summary: 'Analyze a sample contract (1-5)',
    description:
      'Submits one of the 5 built-in sample contracts for compliance analysis. ' +
      'Delegates to the real DocumentsService.analyze() so the full RAG pipeline runs. ' +
      'Returns 202 with documentId and analysisJobId — poll GET /documents/:documentId/analysis for results.',
  })
  @ApiParam({
    name: 'contractNumber',
    description: 'Contract number (1 through 5)',
    example: 1,
  })
  @ApiResponse({
    status: 202,
    description: 'Document created and analysis job queued',
  })
  async analyzeContract(
    @Param('contractNumber', ParseIntPipe) contractNumber: number,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    if (contractNumber < 1 || contractNumber > SAMPLE_CONTRACTS.length) {
      throw new BadRequestException(
        this.i18n.t(CommonI18n.errors.BAD_REQUEST) ??
          `contractNumber must be between 1 and ${SAMPLE_CONTRACTS.length}`,
      );
    }

    const contract = SAMPLE_CONTRACTS[contractNumber - 1];

    return this.documentsService.analyze(
      { title: contract.title, content: contract.content },
      user,
    );
  }
}
