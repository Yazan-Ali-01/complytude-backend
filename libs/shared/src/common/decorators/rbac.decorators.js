"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UseAiModelCheck = exports.USE_AI_MODEL_CHECK_KEY = exports.UseRoleRateLimit = exports.USE_RATE_LIMIT_KEY = exports.RequirePiiMasking = exports.REQUIRE_PII_MASKING_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.REQUIRE_PII_MASKING_KEY = 'requirePiiMasking';
const RequirePiiMasking = () => (0, common_1.SetMetadata)(exports.REQUIRE_PII_MASKING_KEY, true);
exports.RequirePiiMasking = RequirePiiMasking;
exports.USE_RATE_LIMIT_KEY = 'useRateLimit';
const UseRoleRateLimit = () => (0, common_1.SetMetadata)(exports.USE_RATE_LIMIT_KEY, true);
exports.UseRoleRateLimit = UseRoleRateLimit;
exports.USE_AI_MODEL_CHECK_KEY = 'useAiModelCheck';
const UseAiModelCheck = () => (0, common_1.SetMetadata)(exports.USE_AI_MODEL_CHECK_KEY, true);
exports.UseAiModelCheck = UseAiModelCheck;
//# sourceMappingURL=rbac.decorators.js.map