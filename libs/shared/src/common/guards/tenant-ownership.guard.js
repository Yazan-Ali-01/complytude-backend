"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantOwnershipGuard = void 0;
const common_1 = require("@nestjs/common");
const nestjs_i18n_1 = require("nestjs-i18n");
const i18n_keys_1 = require("../constants/i18n-keys");
let TenantOwnershipGuard = class TenantOwnershipGuard {
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const i18n = nestjs_i18n_1.I18nContext.current();
        if (!user) {
            throw new common_1.UnauthorizedException(i18n?.t(i18n_keys_1.I18nKeys.UNAUTHORIZED) ?? 'Unauthorized');
        }
        if (user.isSystemAdmin) {
            return true;
        }
        const tenantIdFromRoute = request.params.tenantId || request.params.id;
        const tenantIdFromBody = request.body?.tenantId;
        const targetTenantId = tenantIdFromRoute || tenantIdFromBody;
        if (!targetTenantId) {
            throw new common_1.BadRequestException(i18n?.t(i18n_keys_1.I18nKeys.BAD_REQUEST) ?? 'Bad Request');
        }
        const userTenantId = user.tenantId;
        if (!userTenantId) {
            throw new common_1.ForbiddenException(i18n?.t(i18n_keys_1.I18nKeys.FORBIDDEN) ?? 'Forbidden');
        }
        if (userTenantId !== targetTenantId) {
            throw new common_1.ForbiddenException(i18n?.t(i18n_keys_1.I18nKeys.FORBIDDEN) ?? 'Forbidden');
        }
        return true;
    }
};
exports.TenantOwnershipGuard = TenantOwnershipGuard;
exports.TenantOwnershipGuard = TenantOwnershipGuard = __decorate([
    (0, common_1.Injectable)()
], TenantOwnershipGuard);
//# sourceMappingURL=tenant-ownership.guard.js.map