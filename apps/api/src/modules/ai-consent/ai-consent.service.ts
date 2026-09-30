import { AuditService } from '@lib/audit';
import { DatabaseService } from '@lib/database';
import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import type { PoolClient } from 'pg';
import { AI_DISCLOSURE_VERSION } from 'src/common/constants/ai-disclosure.constant';
import { TenantAiConsentRepository } from 'src/repositories/tenants/tenant-ai-consent.repository';
import { TenantsI18n } from '../tenants/constants/i18n.constants';
import type { AiConsentStatusDto } from './dto/ai-consent-status.dto';

/** Where the consent was given: the checkbox when the organization was set up, or its settings. */
export type AiConsentChannel = 'organization_setup' | 'settings';

/**
 * An organization's consent to AI processing (D-5): its contract text, masked, goes to the AI
 * processors in docs/SUBPROCESSORS.md, and scanned pages to OCR. A tenant admin accepts a version
 * of the disclosure once; until the current version is accepted, analysis and uploads are refused.
 */
@Injectable()
export class AiConsentService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly repository: TenantAiConsentRepository,
    private readonly auditService: AuditService,
    private readonly i18n: I18nService,
  ) {}

  async getStatus(tenantId: string): Promise<AiConsentStatusDto> {
    const { latest, accepted } =
      await this.databaseService.transactionWithTenantContext(
        { tenantId },
        async (client) => ({
          latest: await this.repository.findLatest(tenantId, { client }),
          accepted: await this.repository.hasAccepted(
            tenantId,
            AI_DISCLOSURE_VERSION,
            { client },
          ),
        }),
      );
    return {
      currentVersion: AI_DISCLOSURE_VERSION,
      accepted,
      acceptedVersion: latest?.disclosure_version ?? null,
      acceptedAt: latest ? latest.accepted_at.toISOString() : null,
      acceptedBy: latest?.accepted_by ?? null,
    };
  }

  /** A tenant admin accepts the current version from the organization's settings. */
  async accept(
    tenantId: string,
    userId: string,
    version: string,
  ): Promise<AiConsentStatusDto> {
    this.assertCurrentVersion(version);
    const recorded = await this.databaseService.transactionWithTenantContext(
      { tenantId, isTenantAdmin: true },
      (client) =>
        this.repository.accept(
          {
            tenant_id: tenantId,
            disclosure_version: version,
            accepted_by: userId,
          },
          { client },
        ),
    );
    if (recorded) await this.audit(tenantId, userId, version, 'settings');
    return this.getStatus(tenantId);
  }

  /**
   * The setup checkbox: recorded in the transaction that creates the organization. The caller
   * audits it with `audit()` once that transaction has committed.
   */
  async recordAtSetup(
    tenantId: string,
    userId: string,
    version: string,
    client: PoolClient,
  ): Promise<void> {
    this.assertCurrentVersion(version);
    await this.repository.accept(
      { tenant_id: tenantId, disclosure_version: version, accepted_by: userId },
      { client },
    );
  }

  /** 403 with `reason: 'ai_consent_required'` unless the current version is accepted. */
  async assertAccepted(tenantId: string): Promise<void> {
    const accepted = await this.databaseService.transactionWithTenantContext(
      { tenantId },
      (client) =>
        this.repository.hasAccepted(tenantId, AI_DISCLOSURE_VERSION, {
          client,
        }),
    );
    if (accepted) return;
    throw new ForbiddenException({
      statusCode: HttpStatus.FORBIDDEN,
      message: this.i18n.t(TenantsI18n.errors.AI_CONSENT_REQUIRED),
      reason: 'ai_consent_required',
      disclosureVersion: AI_DISCLOSURE_VERSION,
    });
  }

  /** AuditService.log never throws: a lost audit row doesn't undo the consent. */
  async audit(
    tenantId: string,
    userId: string,
    version: string,
    channel: AiConsentChannel,
  ): Promise<void> {
    await this.auditService.log({
      tenantId,
      actorId: userId,
      actorType: 'user',
      action: 'AI_PROCESSING_ACCEPTED',
      resourceType: 'tenants',
      resourceId: tenantId,
      details: { disclosureVersion: version, channel },
    });
  }

  private assertCurrentVersion(version: string): void {
    if (version !== AI_DISCLOSURE_VERSION) {
      throw new BadRequestException(
        this.i18n.t(TenantsI18n.errors.AI_DISCLOSURE_OUTDATED, {
          args: { current: AI_DISCLOSURE_VERSION },
        }),
      );
    }
  }
}
