import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { FeaturesService } from './features.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { Workspace, WorkspaceSchema } from './entities/workspace.entity';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly featuresService: FeaturesService,
  ) {}

  /**
   * Initialize the multi-tenancy infrastructure
   * Creates the main workspaces table and RLS policies
   */
  async initializeMultiTenancy(): Promise<void> {
    try {
      await this.databaseService.transaction(async (client) => {
        // Create workspaces table
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.workspaces (
            id VARCHAR(255) PRIMARY KEY,
            workspace_id VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'user', 'viewer')),
            plan VARCHAR(50) NOT NULL CHECK (plan IN ('early_access', 'basic', 'pro', 'enterprise')),
            features JSONB NOT NULL DEFAULT '{}',
            schema_name VARCHAR(255) UNIQUE NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Create workspace schemas table
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.workspace_schemas (
            workspace_id VARCHAR(255) PRIMARY KEY REFERENCES public.workspaces(workspace_id) ON DELETE CASCADE,
            schema_name VARCHAR(255) UNIQUE NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Create indexes
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_workspaces_workspace_id ON public.workspaces(workspace_id);
          CREATE INDEX IF NOT EXISTS idx_workspaces_email ON public.workspaces(email);
          CREATE INDEX IF NOT EXISTS idx_workspace_schemas_workspace_id ON public.workspace_schemas(workspace_id);
        `);

        // Enable Row Level Security on workspaces table
        await client.query(`
          ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
        `);

        // Create RLS policy for workspaces - users can only see their own workspace
        await client.query(`
          DROP POLICY IF EXISTS workspace_isolation_policy ON public.workspaces;
          CREATE POLICY workspace_isolation_policy ON public.workspaces
            USING (workspace_id = current_setting('app.current_workspace_id', true));
        `);
      });
    } catch (error) {
      this.logger.error('Failed to initialize multi-tenancy', error);
      throw new InternalServerErrorException(
        'Failed to initialize multi-tenancy',
      );
    }
  }

  /**
   * Create a new workspace with isolated schema
   */
  async createWorkspace(
    createWorkspaceDto: CreateWorkspaceDto,
    userId: string = `user_${randomUUID()}`,
  ): Promise<Workspace> {
    const workspaceId = `workspace_${randomUUID()}`;
    const schemaName = `workspace_${workspaceId.replace(/-/g, '_')}`;

    try {
      // Check if email already exists
      const existingWorkspace = await this.databaseService.query(
        'SELECT id FROM public.workspaces WHERE email = $1',
        [createWorkspaceDto.email],
      );

      if (existingWorkspace.rows.length > 0) {
        throw new ConflictException('Email already registered');
      }

      return await this.databaseService.transaction(async (client) => {
        // Create workspace record
        const workspaceResult = await client.query<Workspace>(
          `
          INSERT INTO public.workspaces (id, workspace_id, email, plan, features, schema_name, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, true)
          RETURNING *
        `,
          [
            userId,
            workspaceId,
            createWorkspaceDto.email,
            createWorkspaceDto.plan,
            JSON.stringify(createWorkspaceDto.features),
            schemaName,
          ],
        );

        const workspace = workspaceResult.rows[0];

        // Create schema record
        await client.query(
          `
          INSERT INTO public.workspace_schemas (workspace_id, schema_name, is_active)
          VALUES ($1, $2, true)
        `,
          [workspaceId, schemaName],
        );

        // Create the actual database schema
        await this.createWorkspaceSchema(client, schemaName);

        // Initialize schema with base tables
        await this.initializeWorkspaceSchema(client, schemaName, workspaceId);

        // Parse features back to object
        workspace.features =
          typeof workspace.features === 'string'
            ? JSON.parse(workspace.features)
            : workspace.features;

        return workspace;
      });
    } catch (error) {
      this.logger.error(`Failed to create workspace: ${error.message}`, error);
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create workspace');
    }
  }

  /**
   * Create a database schema for a workspace
   */
  private async createWorkspaceSchema(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    await client.query(`GRANT USAGE ON SCHEMA ${schemaName} TO CURRENT_USER`);
    await client.query(`GRANT CREATE ON SCHEMA ${schemaName} TO CURRENT_USER`);
  }

  /**
   * Initialize workspace schema with base tables and RLS
   */
  private async initializeWorkspaceSchema(
    client: PoolClient,
    schemaName: string,
    _workspaceId: string,
  ): Promise<void> {
    // Example: Create a documents table with RLS
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.documents (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        metadata JSONB DEFAULT '{}',
        template_key VARCHAR(255),
        template_version VARCHAR(50),
        generation_metadata JSONB,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES public.workspaces(workspace_id)
      );
    `);

    // Enable RLS on workspace tables
    await client.query(`
      ALTER TABLE ${schemaName}.documents ENABLE ROW LEVEL SECURITY;
    `);

    // Create RLS policy - documents are isolated by workspace_id
    await client.query(`
      CREATE POLICY documents_workspace_isolation ON ${schemaName}.documents
        USING (workspace_id = current_setting('app.current_workspace_id', true));
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON ${schemaName}.documents(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_documents_template_key ON ${schemaName}.documents(template_key);
    `);
  }

  /**
   * Get workspace by ID
   */
  async findById(workspaceId: string): Promise<Workspace> {
    try {
      const result = await this.databaseService.query<Workspace>(
        'SELECT * FROM public.workspaces WHERE workspace_id = $1',
        [workspaceId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Workspace ${workspaceId} not found`);
      }

      const workspace = result.rows[0];
      workspace.features =
        typeof workspace.features === 'string'
          ? JSON.parse(workspace.features)
          : workspace.features;

      return workspace;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to fetch workspace');
    }
  }

  /**
   * Get workspace by email
   */
  async findByEmail(email: string): Promise<Workspace> {
    try {
      const result = await this.databaseService.query<Workspace>(
        'SELECT * FROM public.workspaces WHERE email = $1',
        [email],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Workspace with email ${email} not found`);
      }

      const workspace = result.rows[0];
      workspace.features =
        typeof workspace.features === 'string'
          ? JSON.parse(workspace.features)
          : workspace.features;

      return workspace;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to fetch workspace');
    }
  }

  /**
   * Get all workspaces (admin only)
   */
  async findAll(): Promise<Workspace[]> {
    try {
      const result = await this.databaseService.query<Workspace>(
        'SELECT * FROM public.workspaces ORDER BY created_at DESC',
      );

      return result.rows.map((workspace) => ({
        ...workspace,
        features:
          typeof workspace.features === 'string'
            ? JSON.parse(workspace.features)
            : workspace.features,
      }));
    } catch {
      throw new InternalServerErrorException('Failed to fetch workspaces');
    }
  }

  /**
   * Update workspace
   */
  async updateWorkspace(
    workspaceId: string,
    updateWorkspaceDto: UpdateWorkspaceDto,
  ): Promise<Workspace> {
    try {
      await this.findById(workspaceId);

      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updateWorkspaceDto.email) {
        updateFields.push(`email = $${paramIndex++}`);
        values.push(updateWorkspaceDto.email);
      }
      if (updateWorkspaceDto.plan) {
        updateFields.push(`plan = $${paramIndex++}`);
        values.push(updateWorkspaceDto.plan);
      }
      if (updateWorkspaceDto.features) {
        updateFields.push(`features = $${paramIndex++}`);
        values.push(JSON.stringify(updateWorkspaceDto.features));
      }
      if (updateWorkspaceDto.is_active !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        values.push(updateWorkspaceDto.is_active);
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(workspaceId);

      const query = `
        UPDATE public.workspaces 
        SET ${updateFields.join(', ')}
        WHERE workspace_id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.databaseService.query<Workspace>(query, values);

      const updatedWorkspace = result.rows[0];
      updatedWorkspace.features =
        typeof updatedWorkspace.features === 'string'
          ? JSON.parse(updatedWorkspace.features)
          : updatedWorkspace.features;

      return updatedWorkspace;
    } catch (error) {
      this.logger.error(`Failed to update workspace: ${error.message}`);
      throw new InternalServerErrorException('Failed to update workspace');
    }
  }

  /**
   * Delete workspace and its schema
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    try {
      const workspace = await this.findById(workspaceId);

      await this.databaseService.transaction(async (client) => {
        // Drop the schema
        await client.query(
          `DROP SCHEMA IF EXISTS ${workspace.schema_name} CASCADE`,
        );

        // Delete workspace record
        await client.query(
          'DELETE FROM public.workspaces WHERE workspace_id = $1',
          [workspaceId],
        );
      });
    } catch (error) {
      this.logger.error(`Failed to delete workspace: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete workspace');
    }
  }

  /**
   * Get workspace schema information
   */
  async getWorkspaceSchema(workspaceId: string): Promise<WorkspaceSchema> {
    try {
      const result = await this.databaseService.query<WorkspaceSchema>(
        'SELECT * FROM public.workspace_schemas WHERE workspace_id = $1',
        [workspaceId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(
          `Schema for workspace ${workspaceId} not found`,
        );
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Failed to fetch workspace schema',
      );
    }
  }

  /**
   * Set workspace context for RLS
   */
  async setWorkspaceContext(
    client: PoolClient,
    workspaceId: string,
  ): Promise<void> {
    await client.query(`SET LOCAL app.current_workspace_id = '${workspaceId}'`);
  }

  /**
   * Get document count for a workspace
   * Assumes documents are stored in a 'documents' table in the workspace's schema
   */
  async getDocumentCount(workspaceId: string): Promise<number> {
    try {
      // Get workspace's schema name
      const workspace = await this.findById(workspaceId);
      const schemaName = workspace.schema_name;

      // Check if documents table exists in workspace schema
      const tableExists = await this.databaseService.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = $1 
          AND table_name = 'documents'
        )`,
        [schemaName],
      );

      if (!tableExists.rows[0].exists) {
        return 0;
      }

      // Count documents in workspace schema
      const result = await this.databaseService.query(
        `SELECT COUNT(*) as count FROM "${schemaName}".documents`,
      );

      const count = parseInt(String(result.rows[0].count), 10);
      return count;
    } catch (error) {
      this.logger.error(
        `Failed to get document count for workspace ${workspaceId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve document count',
      );
    }
  }

  /**
   * Check if workspace can upload more documents based on their plan limit
   */
  async canUploadDocument(workspaceId: string): Promise<{
    allowed: boolean;
    limit: number;
    current: number;
    message?: string;
  }> {
    try {
      // Get current document count
      const currentCount = await this.getDocumentCount(workspaceId);

      // Use FeaturesService to get the correct document limit (merges plan defaults with custom features)
      const result = await this.featuresService.checkDocumentLimit(
        workspaceId,
        currentCount,
      );

      // Add descriptive message
      const message = result.allowed
        ? result.limit === -1
          ? 'Unlimited documents'
          : `${result.current}/${result.limit} documents used`
        : `Document limit reached (${result.limit}). Please upgrade your plan.`;

      return {
        ...result,
        message,
      };
    } catch (error) {
      this.logger.error(
        `Failed to check document upload permission for workspace ${workspaceId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to check document upload permission',
      );
    }
  }
}
