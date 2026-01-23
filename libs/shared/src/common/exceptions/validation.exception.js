"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationException = void 0;
const common_1 = require("@nestjs/common");
const nestjs_i18n_1 = require("nestjs-i18n");
const i18n_keys_1 = require("../../common/constants/i18n-keys");
class ValidationException extends common_1.HttpException {
    constructor(_details) {
        const i18n = nestjs_i18n_1.I18nContext.current();
        super({
            statusCode: common_1.HttpStatus.BAD_REQUEST,
            error: i18n?.t(i18n_keys_1.I18nKeys.BAD_REQUEST) ?? 'Bad Request',
            message: i18n?.t(i18n_keys_1.I18nKeys.VALIDATION_ERROR) ?? 'Variable validation failed',
        }, common_1.HttpStatus.BAD_REQUEST);
    }
}
exports.ValidationException = ValidationException;
//# sourceMappingURL=validation.exception.js.map