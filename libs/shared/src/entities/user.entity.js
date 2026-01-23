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
exports.User = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
class User {
    id;
    email;
    password_hash;
    first_name;
    last_name;
    is_verified;
    is_system_admin;
    created_at;
    updated_at;
    constructor(partial) {
        Object.assign(this, partial);
    }
}
exports.User = User;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User ID' }),
    __metadata("design:type", String)
], User.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User email address' }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, class_transformer_1.Exclude)(),
    __metadata("design:type", String)
], User.prototype, "password_hash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User first name' }),
    __metadata("design:type", Object)
], User.prototype, "first_name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User last name' }),
    __metadata("design:type", Object)
], User.prototype, "last_name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Email verification status' }),
    __metadata("design:type", Boolean)
], User.prototype, "is_verified", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'System admin status' }),
    __metadata("design:type", Boolean)
], User.prototype, "is_system_admin", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Account creation timestamp' }),
    __metadata("design:type", Date)
], User.prototype, "created_at", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last update timestamp' }),
    __metadata("design:type", Date)
], User.prototype, "updated_at", void 0);
//# sourceMappingURL=user.entity.js.map