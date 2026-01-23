"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TenantContextInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantContextInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
let TenantContextInterceptor = TenantContextInterceptor_1 = class TenantContextInterceptor {
    logger = new common_1.Logger(TenantContextInterceptor_1.name);
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const tenantContext = request.tenantContext;
        if (tenantContext) {
            this.logger.debug(`Request from tenant: ${tenantContext.tenantId} | Schema: ${tenantContext.schemaName}`);
        }
        const now = Date.now();
        return next.handle().pipe((0, operators_1.tap)(() => {
            const responseTime = Date.now() - now;
            this.logger.debug(`Response time: ${responseTime}ms | Tenant: ${tenantContext?.tenantId || 'N/A'}`);
        }));
    }
};
exports.TenantContextInterceptor = TenantContextInterceptor;
exports.TenantContextInterceptor = TenantContextInterceptor = TenantContextInterceptor_1 = __decorate([
    (0, common_1.Injectable)()
], TenantContextInterceptor);
//# sourceMappingURL=tenant-context.interceptor.js.map