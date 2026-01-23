"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserTenant = void 0;
const swagger_1 = require("@nestjs/swagger");
class UserTenant {
    user_id;
    tenant_id;
    role;
    is_active;
    joined_at;
    updated_at;
}
exports.UserTenant = UserTenant;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User ID' }),
    __metadata("design:type", String)
], UserTenant.prototype, "user_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tenant ID (UUID)' }),
    __metadata("design:type", String)
], UserTenant.prototype, "tenant_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'User role in the tenant',
        enum: ['tenant_admin', 'legal_counsel', 'member', 'viewer'],
    }),
    __metadata("design:type", String)
], UserTenant.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether user access is active' }),
    __metadata("design:type", Boolean)
], UserTenant.prototype, "is_active", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'When user joined the tenant' }),
    __metadata("design:type", Date)
], UserTenant.prototype, "joined_at", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last update timestamp' }),
    __metadata("design:type", Date)
], UserTenant.prototype, "updated_at", void 0);
//# sourceMappingURL=user-tenant.entity.js.map