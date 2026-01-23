"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaName = exports.TenantId = exports.TenantContext = void 0;
const common_1 = require("@nestjs/common");
exports.TenantContext = (0, common_1.createParamDecorator)((data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantContext;
});
exports.TenantId = (0, common_1.createParamDecorator)((data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantContext?.tenantId;
});
exports.SchemaName = (0, common_1.createParamDecorator)((data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantContext?.schemaName;
});
//# sourceMappingURL=tenant.decorator.js.map