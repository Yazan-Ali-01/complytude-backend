import { HttpException, HttpStatus } from '@nestjs/common';
import type { I18nService } from 'nestjs-i18n';
import type {
  EntitlementCheckResult,
  FeatureKey,
} from 'src/common/types/entitlement.types';
import { EntitlementsI18n } from '../constants/i18n.constants';
import { paymentOverdueException } from './past-due-access.util';

/**
 * The 402 a refused usage check answers: the payment is overdue (past the grace period), or this
 * billing period's allowance is used up and the credits don't cover it. The body carries what a
 * frontend needs to offer credits or an upgrade.
 */
export function usageRefusedException(
  featureKey: FeatureKey,
  result: EntitlementCheckResult,
  i18n: I18nService,
): HttpException {
  if (result.reason === 'payment_required') {
    return paymentOverdueException(
      featureKey,
      i18n.t(EntitlementsI18n.errors.PAYMENT_OVERDUE),
    );
  }
  const feature = i18n.t(`email.quota_exceeded.features.${featureKey}`, {
    defaultValue: featureKey,
  });
  return new HttpException(
    {
      statusCode: HttpStatus.PAYMENT_REQUIRED,
      message: i18n.t(EntitlementsI18n.errors.ALLOWANCE_USED, {
        args: { feature },
      }),
      reason: 'quota_exceeded',
      feature: featureKey,
      limit: result.limit,
      used: result.used,
      creditsAvailable: result.creditsRemaining ?? 0,
      upgradeUrl: '/plans',
    },
    HttpStatus.PAYMENT_REQUIRED,
  );
}
