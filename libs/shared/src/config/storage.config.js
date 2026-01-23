"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('storage', () => ({
    s3: {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION,
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    },
    bucket: {
        filesBucketName: process.env.COMPLYTUDE_FILES_BUCKET_NAME,
    },
    templates: {
        bucketName: process.env.TEMPLATES_BUCKET_NAME,
        allowedMimeTypes: [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        maxFileSize: parseInt(process.env.TEMPLATE_MAX_FILE_SIZE, 10),
    },
    upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10),
        allowedMimeTypes: [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/png',
            'image/jpeg',
        ],
    },
    signedUrl: {
        expiresIn: parseInt(process.env.SIGNED_URL_EXPIRES_IN, 10),
    },
}));
//# sourceMappingURL=storage.config.js.map