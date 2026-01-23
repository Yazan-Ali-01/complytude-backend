"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('app', () => ({
    port: parseInt(process.env.PORT, 10),
    environment: process.env.NODE_ENV,
    apiPrefix: process.env.API_PREFIX,
    corsOrigins: process.env.CORS_ORIGINS.split(','),
}));
//# sourceMappingURL=app.config.js.map