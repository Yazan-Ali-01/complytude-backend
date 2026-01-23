"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validationSchema = void 0;
const Joi = __importStar(require("joi"));
exports.validationSchema = Joi.object({
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
    PORT: Joi.number().default(3000),
    API_PREFIX: Joi.string().default('api'),
    CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
    DB_HOST: Joi.string().default('localhost'),
    DB_PORT: Joi.number().default(5432),
    DB_NAME: Joi.string().required(),
    DB_APP_USER: Joi.string().required(),
    DB_APP_PASSWORD: Joi.string().required(),
    DB_MAX_CONNECTIONS: Joi.number().default(20),
    DB_IDLE_TIMEOUT: Joi.number().default(30000),
    DB_CONNECTION_TIMEOUT: Joi.number().default(2000),
    JWT_ACCESS_SECRET: Joi.string().required(),
    JWT_REFRESH_SECRET: Joi.string().required(),
    JWT_ACCESS_EXPIRES_IN: Joi.string().default('30m'),
    JWT_REFRESH_EXPIRES_IN: Joi.string().default('14d'),
    S3_ENDPOINT: Joi.string().default('http://localhost:9000'),
    S3_REGION: Joi.string().default('us-east-1'),
    S3_ACCESS_KEY: Joi.string().default('minioadmin'),
    S3_SECRET_KEY: Joi.string().default('minioadmin'),
    S3_FORCE_PATH_STYLE: Joi.boolean().default(true),
    COMPLYTUDE_FILES_BUCKET_NAME: Joi.string().default('complytude-files'),
    TEMPLATES_BUCKET_NAME: Joi.string().default('complytude-templates'),
    MAX_FILE_SIZE: Joi.number().default(10485760),
    TEMPLATE_MAX_FILE_SIZE: Joi.number().default(5242880),
    SIGNED_URL_EXPIRES_IN: Joi.number().default(900),
});
//# sourceMappingURL=env.schema.js.map