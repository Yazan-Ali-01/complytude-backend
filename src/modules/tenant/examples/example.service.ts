import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

/**
 * Example service demonstrating multi-tenancy patterns
 * This is a reference implementation - adapt to your needs
 */
@Injectable()
export class ExampleTenantService {
  private readonly logger = new Logger(ExampleTenantService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Example 1: Simple query with tenant context
   */
  async findAllDocuments(tenantId: string, schemaName: string) {
    const result = await this.db.queryWithTenantContext(
      tenantId,
      schemaName,
      'SELECT * FROM documents WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );

    return result.rows;
  }

  /**
   * Example 2: Insert with tenant context
   */
  async createDocument(
    tenantId: string,
    schemaName: string,
    data: { id: string; title: string; content: string },
  ) {
    const result = await this.db.queryWithTenantContext(
      tenantId,
      schemaName,
      `
      INSERT INTO documents (id, tenant_id, title, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [data.id, tenantId, data.title, data.content],
    );

    return result.rows[0];
  }

  /**
   * Example 3: Transaction with tenant context
   */
  async createDocumentWithAudit(
    tenantId: string,
    schemaName: string,
    data: { id: string; title: string; content: string; userId: string },
  ) {
    return this.db.transactionWithTenantContext(
      tenantId,
      schemaName,
      async (client) => {
        // Insert document
        const docResult = await client.query(
          `
          INSERT INTO documents (id, tenant_id, title, content, created_by)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
          [data.id, tenantId, data.title, data.content, data.userId],
        );

        // Insert audit log
        await client.query(
          `
          INSERT INTO audit_logs (id, tenant_id, entity_type, entity_id, action, user_id)
          VALUES (gen_random_uuid(), $1, 'document', $2, 'create', $3)
        `,
          [tenantId, data.id, data.userId],
        );

        return docResult.rows[0];
      },
    );
  }

  /**
   * Example 4: Manual client management for complex operations
   */
  async complexMultiStepOperation(tenantId: string, schemaName: string) {
    const client = await this.db.getTenantClient(tenantId, schemaName);

    try {
      // Step 1: Get documents
      const docsResult = await client.query(
        'SELECT * FROM documents WHERE tenant_id = $1',
        [tenantId],
      );

      // Step 2: Process each document
      for (const doc of docsResult.rows) {
        await client.query(
          'UPDATE documents SET processed = true WHERE id = $1 AND tenant_id = $2',
          [doc.id, tenantId],
        );
      }

      // Step 3: Create summary
      const summary = {
        total: docsResult.rows.length,
        processed: docsResult.rows.length,
      };

      return summary;
    } catch (error) {
      this.logger.error('Complex operation failed', error);
      throw error;
    } finally {
      // Always release the client
      await this.db.releaseTenantClient(client);
    }
  }

  /**
   * Example 5: Create a new table in tenant schema with RLS
   */
  async createTenantTable(schemaName: string, _tenantId: string) {
    await this.db.transaction(async (client) => {
      // Create table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${schemaName}.custom_data (
          id VARCHAR(255) PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          value JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id)
        )
      `);

      // Enable RLS
      await client.query(`
        ALTER TABLE ${schemaName}.custom_data ENABLE ROW LEVEL SECURITY
      `);

      // Create RLS policy
      await client.query(`
        DROP POLICY IF EXISTS custom_data_isolation ON ${schemaName}.custom_data;
        CREATE POLICY custom_data_isolation ON ${schemaName}.custom_data
          USING (tenant_id = current_setting('app.current_tenant_id', true))
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_custom_data_tenant_id 
        ON ${schemaName}.custom_data(tenant_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_custom_data_name 
        ON ${schemaName}.custom_data(name)
      `);

      // Create trigger for updated_at
      await client.query(`
        CREATE TRIGGER update_custom_data_updated_at
          BEFORE UPDATE ON ${schemaName}.custom_data
          FOR EACH ROW
          EXECUTE FUNCTION public.update_updated_at_column()
      `);

      this.logger.log(
        `Created custom_data table in schema ${schemaName} with RLS`,
      );
    });
  }

  /**
   * Example 6: Query across multiple tables with joins
   */
  async getDocumentsWithMetadata(tenantId: string, schemaName: string) {
    const result = await this.db.queryWithTenantContext(
      tenantId,
      schemaName,
      `
      SELECT 
        d.*,
        m.metadata as additional_metadata
      FROM documents d
      LEFT JOIN document_metadata m ON d.id = m.document_id
      WHERE d.tenant_id = $1
      ORDER BY d.created_at DESC
    `,
      [tenantId],
    );

    return result.rows;
  }

  /**
   * Example 7: Pagination with tenant context
   */
  async getPaginatedDocuments(
    tenantId: string,
    schemaName: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const offset = (page - 1) * limit;

    const result = await this.db.queryWithTenantContext(
      tenantId,
      schemaName,
      `
      SELECT * FROM documents 
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
      [tenantId, limit, offset],
    );

    // Get total count
    const countResult = await this.db.queryWithTenantContext<{ count: string }>(
      tenantId,
      schemaName,
      'SELECT COUNT(*) as count FROM documents WHERE tenant_id = $1',
      [tenantId],
    );

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
      },
    };
  }

  /**
   * Example 8: Bulk operations with tenant context
   */
  async bulkCreateDocuments(
    tenantId: string,
    schemaName: string,
    documents: Array<{ id: string; title: string; content: string }>,
  ) {
    return this.db.transactionWithTenantContext(
      tenantId,
      schemaName,
      async (client) => {
        const results: any[] = [];

        for (const doc of documents) {
          const result = await client.query(
            `
            INSERT INTO documents (id, tenant_id, title, content)
            VALUES ($1, $2, $3, $4)
            RETURNING *
          `,
            [doc.id, tenantId, doc.title, doc.content],
          );
          results.push(result.rows[0]);
        }

        this.logger.log(`Bulk created ${results.length} documents`);
        return results;
      },
    );
  }

  /**
   * Example 9: Search with full-text search
   */
  async searchDocuments(
    tenantId: string,
    schemaName: string,
    searchTerm: string,
  ) {
    const result = await this.db.queryWithTenantContext(
      tenantId,
      schemaName,
      `
      SELECT * FROM documents 
      WHERE tenant_id = $1 
        AND (
          title ILIKE $2 
          OR content ILIKE $2
        )
      ORDER BY created_at DESC
    `,
      [tenantId, `%${searchTerm}%`],
    );

    return result.rows;
  }

  /**
   * Example 10: Aggregation queries
   */
  async getDocumentStats(tenantId: string, schemaName: string) {
    const result = await this.db.queryWithTenantContext(
      tenantId,
      schemaName,
      `
      SELECT 
        COUNT(*) as total_documents,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as documents_last_week,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as documents_last_month,
        AVG(LENGTH(content)) as avg_content_length
      FROM documents 
      WHERE tenant_id = $1
    `,
      [tenantId],
    );

    return result.rows[0];
  }
}
