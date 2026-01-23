"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequireUsage = exports.CREDITS_REQUIRED_KEY = exports.USAGE_FEATURE_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.USAGE_FEATURE_KEY = 'usage_feature';
exports.CREDITS_REQUIRED_KEY = 'credits_required';
const RequireUsage = (featureKey, creditsRequired = 1) => {
    return (target, propertyKey, descriptor) => {
        (0, common_1.SetMetadata)(exports.USAGE_FEATURE_KEY, featureKey)(target, propertyKey, descriptor);
        (0, common_1.SetMetadata)(exports.CREDITS_REQUIRED_KEY, creditsRequired)(target, propertyKey, descriptor);
    };
};
exports.RequireUsage = RequireUsage;
//# sourceMappingURL=require-usage.decorator.js.map