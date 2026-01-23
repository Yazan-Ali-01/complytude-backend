"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwaggerCookieAuth = exports.COOKIE_SAME_SITE = exports.COOKIE_PATH = exports.REFRESH_TOKEN_COOKIE_NAME = exports.ACCESS_TOKEN_COOKIE_NAME = void 0;
const swagger_1 = require("@nestjs/swagger");
exports.ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
exports.REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
exports.COOKIE_PATH = '/';
exports.COOKIE_SAME_SITE = 'strict';
exports.SwaggerCookieAuth = {
    refreshToken: () => (0, swagger_1.ApiCookieAuth)(exports.REFRESH_TOKEN_COOKIE_NAME),
    accessToken: () => (0, swagger_1.ApiCookieAuth)(exports.ACCESS_TOKEN_COOKIE_NAME),
};
//# sourceMappingURL=common.js.map