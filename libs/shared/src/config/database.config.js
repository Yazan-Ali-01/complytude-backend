"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('database', () => ({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    name: process.env.DB_NAME,
    user: process.env.DB_APP_USER,
    password: process.env.DB_APP_PASSWORD,
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS, 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10),
}));
//# sourceMappingURL=database.config.js.map