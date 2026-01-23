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
var DatabaseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const pg_1 = require("pg");
let DatabaseService = DatabaseService_1 = class DatabaseService {
    configService;
    logger = new common_1.Logger(DatabaseService_1.name);
    pool;
    constructor(configService) {
        this.configService = configService;
    }
    async onModuleInit() {
        this.pool = new pg_1.Pool({
            host: this.configService.get('database.host'),
            port: this.configService.get('database.port'),
            database: this.configService.get('database.name'),
            user: this.configService.get('database.user'),
            password: this.configService.get('database.password'),
            max: this.configService.get('database.maxConnections'),
            idleTimeoutMillis: this.configService.get('database.idleTimeoutMillis'),
            connectionTimeoutMillis: this.configService.get('database.connectionTimeoutMillis'),
        });
        try {
            const client = await this.pool.connect();
            this.logger.log('✅ Database connection established successfully');
            client.release();
        }
        catch (error) {
            this.logger.error('❌ Failed to connect to database', error);
            throw error;
        }
        this.pool.on('error', (err) => {
            this.logger.error('Unexpected error on idle client', err);
        });
    }
    async onModuleDestroy() {
        if (this.pool) {
            await this.pool.end();
            this.logger.log('Database connection pool closed');
        }
    }
    async query(text, params, bypassRLS = true) {
        const start = Date.now();
        const client = await this.getClient();
        try {
            if (bypassRLS) {
                await client.query("SET LOCAL app.bypass_rls = 'true'");
            }
            const result = await client.query(text, params);
            const duration = Date.now() - start;
            this.logger.debug(`Executed query in ${duration}ms: ${text}`);
            return result;
        }
        catch (error) {
            this.logger.error('Query error', error);
            throw error;
        }
        finally {
            if (bypassRLS) {
            }
            client.release();
        }
    }
    async getClient() {
        return this.pool.connect();
    }
    async transaction(callback, bypassRLS = false) {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            if (bypassRLS) {
                await client.query("SET LOCAL app.bypass_rls = 'true'");
            }
            const result = await callback(client);
            await client.query('COMMIT');
            this.logger.debug('Transaction committed successfully');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            this.logger.error('Transaction rolled back', error);
            throw error;
        }
        finally {
            if (bypassRLS) {
            }
            client.release();
        }
    }
    getPool() {
        return this.pool;
    }
    async queryWithTenantContext(tenantId, text, params) {
        const client = await this.getClient();
        try {
            await client.query(`SET LOCAL app.current_tenant_id = $1`, [tenantId]);
            const result = await client.query(text, params);
            this.logger.debug(`Executed query for tenant ${tenantId}`);
            return result;
        }
        catch (error) {
            this.logger.error(`Query error in tenant context (${tenantId})`, error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    async transactionWithTenantContext(tenantId, callback) {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            await client.query(`SET LOCAL app.current_tenant_id = $1`, [tenantId]);
            const result = await callback(client);
            await client.query('COMMIT');
            this.logger.debug(`Transaction committed for tenant ${tenantId}`);
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            this.logger.error(`Transaction rolled back in tenant context (${tenantId})`, error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getTenantClient(tenantId) {
        const client = await this.getClient();
        try {
            await client.query(`SET LOCAL app.current_tenant_id = $1`, [tenantId]);
            return client;
        }
        catch (error) {
            client.release();
            throw error;
        }
    }
    releaseTenantClient(client) {
        client.release();
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = DatabaseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], DatabaseService);
//# sourceMappingURL=database.service.js.map