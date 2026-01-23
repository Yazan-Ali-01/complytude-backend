"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequireFeature = exports.FEATURES_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.FEATURES_KEY = 'required_features';
const RequireFeature = (...features) => (0, common_1.SetMetadata)(exports.FEATURES_KEY, features);
exports.RequireFeature = RequireFeature;
//# sourceMappingURL=features.decorator.js.map