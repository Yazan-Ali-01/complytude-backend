import {
  Injectable,
  Logger,
  NotImplementedException,
  ForbiddenException,
} from '@nestjs/common';
import { RbacService } from '../rbac/services/rbac.service';
import { Permissions } from '../rbac/constants/permissions.constant';
import { TenantRole } from '../rbac/constants/roles.constant';
import { PiiMaskingService } from './services/pii-masking.service';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import type {
  DeleteDocumentResponseDto,
  DocumentListResponseDto,
  DocumentResponseDto,
  GenerateDocumentDto,
  GenerateDocumentResponseDto,
  ListDocumentsQueryDto,
  PreviewDocumentDto,
  PreviewDocumentResponseDto,
} from './dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly rbacService: RbacService,
    private readonly piiMaskingService: PiiMaskingService,
  ) {}

  preview(
    _dto: PreviewDocumentDto,
    _user: AuthenticatedUser,
  ): Promise<PreviewDocumentResponseDto> {
    return Promise.reject(
      new NotImplementedException(
        'Document preview generation not yet implemented',
      ),
    );
  }

  generate(
    _dto: GenerateDocumentDto,
    _user: AuthenticatedUser,
  ): Promise<GenerateDocumentResponseDto> {
    return Promise.reject(
      new NotImplementedException('Document generation not yet implemented'),
    );
  }

  findAll(
    _query: ListDocumentsQueryDto,
    _user: AuthenticatedUser,
  ): Promise<DocumentListResponseDto> {
    return Promise.reject(
      new NotImplementedException('Document listing not yet implemented'),
    );
  }

  async findOne(
    id: string,
    user: AuthenticatedUser,
  ): Promise<DocumentResponseDto> {
    this.logger.debug(`Finding document: ${id} for user: ${user.userId}`);

    const doc = await this.getDocumentById(id);

    const canViewPii = await this.rbacService.roleHasPermission(
      user.role as TenantRole,
      Permissions.AI.VIEW_UNMASKED_PII,
    );

    if (!canViewPii) {
      const maskedContent = doc.content
        ? this.piiMaskingService.mask(doc.content)
        : null;
      return {
        ...doc,
        content: maskedContent,
        piiMasked: true,
      };
    }

    return { ...doc, piiMasked: false };
  }

  async findOneUnmasked(
    id: string,
    user: AuthenticatedUser,
  ): Promise<DocumentResponseDto> {
    this.logger.debug(
      `Finding document unmasked: ${id} for user: ${user.userId}`,
    );

    const doc = await this.getDocumentById(id);
    const canViewPii = await this.rbacService.roleHasPermission(
      user.role as TenantRole,
      Permissions.AI.VIEW_UNMASKED_PII,
    );

    if (!canViewPii) {
      throw new ForbiddenException(
        'You do not have permission to view unmasked PII in documents',
      );
    }

    return { ...doc, piiMasked: false };
  }

  remove(
    _id: string,
    _user: AuthenticatedUser,
  ): Promise<DeleteDocumentResponseDto> {
    return Promise.reject(
      new NotImplementedException('Document deletion not yet implemented'),
    );
  }

  private getDocumentById(id: string): Promise<DocumentResponseDto> {
    this.logger.debug(`Fetching document from database: ${id}`);
    return Promise.resolve({
      id,
      tenantId: 'tenant-123',
      title: 'Sample Document',
      content:
        'This is sample content with PII like john@example.com and SSN 123-45-6789.',
      metadata: { originalFilename: 'sample.docx', fileSize: 12345 },
      templateId: null,
      templateKey: 'sample_template',
      templateVersionId: null,
      templateVersion: '1.0.0',
      generationMetadata: { variables: {}, generatedBy: 'system' },
      downloadUrls: {
        docx: 'https://example.com/doc.docx',
        pdf: 'https://example.com/doc.pdf',
      },
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdBy: 'user-123',
      createdByUser: {
        id: 'user-123',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      piiMasked: false,
    });
  }
}
