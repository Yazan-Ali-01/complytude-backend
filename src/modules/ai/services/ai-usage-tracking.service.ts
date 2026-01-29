import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface UserDailyUsage {
  userId: string;
  tenantId: string;
  date: string;
  usageCount: number;
}

@Injectable()
export class AiUsageTrackingService {
  private readonly logger = new Logger(AiUsageTrackingService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async getDailyAiUsage(userId: string, tenantId: string): Promise<number> {
    try {
      const today = this.getTodayMidnightUtc();

      const result = await this.databaseService.query(
        `SELECT COALESCE(usage_count, 0) as count
         FROM public.user_ai_usage
         WHERE user_id = $1 AND tenant_id = $2 AND date = $3`,
        [userId, tenantId, today],
      );

      return parseInt(String(result.rows[0]?.count ?? 0), 10);
    } catch (error) {
      this.logger.error(
        `Failed to get daily AI usage for user ${userId}, tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException('Failed to retrieve AI usage');
    }
  }

  async incrementAiGeneration(
    userId: string,
    tenantId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const today = this.getTodayMidnightUtc();

      await this.databaseService.query(
        `INSERT INTO public.user_ai_usage (user_id, tenant_id, date, usage_count, metadata)
         VALUES ($1, $2, $3, 1, $4)
         ON CONFLICT (user_id, tenant_id, date)
         DO UPDATE SET usage_count = user_ai_usage.usage_count + 1, metadata = $4`,
        [userId, tenantId, today, metadata ? JSON.stringify(metadata) : null],
      );

      this.logger.debug(
        `AI generation incremented for user ${userId}, tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to increment AI generation for user ${userId}, tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException('Failed to record AI usage');
    }
  }

  async decrementAiGeneration(
    userId: string,
    tenantId: string,
    delta = 1,
  ): Promise<void> {
    try {
      const today = this.getTodayMidnightUtc();

      await this.databaseService.query(
        `UPDATE public.user_ai_usage
         SET usage_count = GREATEST(0, usage_count - $1)
         WHERE user_id = $2 AND tenant_id = $3 AND date = $4`,
        [delta, userId, tenantId, today],
      );

      this.logger.debug(
        `AI generation decremented for user ${userId}, tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to decrement AI generation for user ${userId}, tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException('Failed to update AI usage');
    }
  }

  async getUsageHistory(
    userId: string,
    tenantId: string,
    days = 30,
  ): Promise<UserDailyUsage[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];

      const result = await this.databaseService.query(
        `SELECT user_id, tenant_id, date, usage_count
         FROM public.user_ai_usage
         WHERE user_id = $1 AND tenant_id = $2 AND date >= $3
         ORDER BY date DESC`,
        [userId, tenantId, startDateStr],
      );

      return result.rows.map((row) => ({
        userId: row.user_id as string,
        tenantId: row.tenant_id as string,
        date: row.date as string,
        usageCount: parseInt(String(row.usage_count), 10),
      }));
    } catch (error) {
      this.logger.error(
        `Failed to get AI usage history for user ${userId}, tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve AI usage history',
      );
    }
  }

  async resetUserUsage(userId: string, tenantId: string): Promise<void> {
    try {
      const today = this.getTodayMidnightUtc();

      await this.databaseService.query(
        `UPDATE public.user_ai_usage
         SET usage_count = 0
         WHERE user_id = $1 AND tenant_id = $2 AND date = $3`,
        [userId, tenantId, today],
      );

      this.logger.debug(
        `AI usage reset for user ${userId}, tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to reset AI usage for user ${userId}, tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException('Failed to reset AI usage');
    }
  }

  async getTotalMonthlyUsage(tenantId: string): Promise<number> {
    try {
      const startOfMonth = this.getStartOfMonth();

      const result = await this.databaseService.query(
        `SELECT COALESCE(SUM(usage_count), 0) as total
         FROM public.user_ai_usage
         WHERE tenant_id = $1 AND date >= $2`,
        [tenantId, startOfMonth],
      );

      return parseInt(String(result.rows[0]?.total ?? 0), 10);
    } catch (error) {
      this.logger.error(
        `Failed to get total monthly AI usage for tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve monthly AI usage',
      );
    }
  }

  private getTodayMidnightUtc(): string {
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    return today.toISOString().split('T')[0];
  }

  private getStartOfMonth(): string {
    const now = new Date();
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    return startOfMonth.toISOString().split('T')[0];
  }
}
