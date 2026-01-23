import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PII_MASKING_KEY = 'requirePiiMasking';

export const RequirePiiMasking = () =>
  SetMetadata(REQUIRE_PII_MASKING_KEY, true);

export const USE_RATE_LIMIT_KEY = 'useRateLimit';

export const UseRoleRateLimit = () => SetMetadata(USE_RATE_LIMIT_KEY, true);

export const USE_AI_MODEL_CHECK_KEY = 'useAiModelCheck';

export const UseAiModelCheck = () => SetMetadata(USE_AI_MODEL_CHECK_KEY, true);
