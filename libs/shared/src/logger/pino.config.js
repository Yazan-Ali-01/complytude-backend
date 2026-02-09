"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPinoConfig = createPinoConfig;
exports.extractTenantFromRequest = extractTenantFromRequest;
const uuid_1 = require("uuid");
function createPinoConfig(options) {
    const { serviceName, logLevel = 'info', prettyPrint = false, autoLogging = true, tenantExtractor, } = options;
    return {
        pinoHttp: {
            level: logLevel,
            base: {
                service_name: serviceName,
                pid: undefined,
                hostname: undefined,
            },
            transport: prettyPrint
                ? {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        levelFirst: true,
                        translateTime: 'yyyy-mm-dd HH:MM:ss.l',
                        ignore: 'pid,hostname',
                        singleLine: false,
                        messageFormat: '{msg}',
                    },
                }
                : undefined,
            formatters: prettyPrint
                ? undefined
                : {
                    level: (label) => {
                        return { level: label };
                    },
                },
            genReqId: (req) => {
                return (req.headers['x-request-id'] || req.headers['x-trace-id'] || (0, uuid_1.v4)());
            },
            customProps: (req) => {
                const customProps = {
                    trace_id: req.id,
                };
                if (tenantExtractor) {
                    const tenantId = tenantExtractor(req);
                    if (tenantId) {
                        customProps.tenant_id = tenantId;
                    }
                }
                if (req.auth?.tenant?.tenantId) {
                    customProps.tenant_id = req.auth.tenant.tenantId;
                    customProps.user_id = req.auth.tenant.userId;
                }
                return customProps;
            },
            redact: {
                paths: [
                    'req.headers.authorization',
                    'req.headers.cookie',
                    'req.body.password',
                    'req.body.currentPassword',
                    'req.body.newPassword',
                    'req.body.confirmPassword',
                    'req.body.token',
                    'req.query.token',
                    'req.query.password',
                ],
                censor: '[REDACTED]',
            },
            autoLogging: autoLogging
                ? {
                    ignore: (req) => {
                        const ignoredPaths = ['/health', '/api/health', '/metrics', '/'];
                        return ignoredPaths.includes(req.url ?? '');
                    },
                }
                : false,
            customSuccessMessage: (req) => {
                return `${req.method} ${req.url} completed`;
            },
            customErrorMessage: (req, _res, error) => {
                return `${req.method} ${req.url} failed: ${error.message}`;
            },
            serializers: {
                req: (req) => ({
                    id: req.id,
                    method: req.method,
                    url: req.url,
                    remoteAddress: req.ip,
                    headers: {
                        'user-agent': req.headers['user-agent'],
                        'content-type': req.headers['content-type'],
                        accept: req.headers['accept'],
                    },
                }),
                res: (res) => ({
                    statusCode: res.statusCode,
                    responseTime: res.responseTime,
                }),
                err: (err) => ({
                    type: err.type || err.constructor?.name || 'Error',
                    message: err.message,
                    stack: err.stack,
                    statusCode: err.status || err.statusCode,
                    ...(err.response?.message && { details: err.response.message }),
                }),
            },
        },
    };
}
function extractTenantFromRequest(request) {
    if (request.auth?.tenant?.tenantId) {
        return request.auth.tenant.tenantId;
    }
    if (request.tenantContext?.tenantId) {
        return request.tenantContext.tenantId;
    }
    return undefined;
}
//# sourceMappingURL=pino.config.js.map