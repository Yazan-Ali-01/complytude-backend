# Documents Module Implementation Requirements

This document outlines the database schema changes and implementation requirements needed to support the Documents API contract.

## Database Schema Changes Required

The following columns need to be added to the `public.documents` table to support soft-delete functionality:

### New Columns

1. **`is_deleted`** (BOOLEAN, NOT NULL, DEFAULT false)
   - Purpose: Flag to indicate if document is soft-deleted
   - Improves query performance (indexed field is faster than NULL checks)
   - Required for efficient filtering in list queries

2. **`deleted_at`** (TIMESTAMPTZ, NULL)
   - Purpose: Timestamp when document was soft-deleted
   - NULL if document is active
   - Used for audit trail and compliance

3. **`deleted_by`** (UUID, NULL)
   - Purpose: User ID who performed the soft-delete
   - Foreign key to `public.users(id)`
   - NULL if document is active
   - Required for audit trail

### Migration SQL

```sql
-- Add soft-delete columns to documents table
ALTER TABLE public.documents
ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN deleted_at TIMESTAMPTZ NULL,
ADD COLUMN deleted_by UUID NULL;

-- Add foreign key constraint
ALTER TABLE public.documents
ADD CONSTRAINT fk_documents_deleted_by
    FOREIGN KEY (deleted_by)
    REFERENCES public.users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- Add index for soft-delete queries
CREATE INDEX idx_documents_is_deleted ON public.documents(is_deleted);
CREATE INDEX idx_documents_deleted_at ON public.documents(deleted_at) WHERE deleted_at IS NOT NULL;

-- Composite index for tenant + soft-delete filtering
CREATE INDEX idx_documents_tenant_not_deleted ON public.documents(tenant_id, is_deleted) WHERE is_deleted = false;

-- Add comments
COMMENT ON COLUMN public.documents.is_deleted IS 'Soft-delete flag for audit trail';
COMMENT ON COLUMN public.documents.deleted_at IS 'Timestamp when document was soft-deleted';
COMMENT ON COLUMN public.documents.deleted_by IS 'User who soft-deleted the document';
```

### Rollback SQL

```sql
-- Remove indexes
DROP INDEX IF EXISTS public.idx_documents_tenant_not_deleted;
DROP INDEX IF EXISTS public.idx_documents_deleted_at;
DROP INDEX IF EXISTS public.idx_documents_is_deleted;

-- Remove foreign key
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS fk_documents_deleted_by;

-- Remove columns
ALTER TABLE public.documents
DROP COLUMN IF EXISTS deleted_by,
DROP COLUMN IF EXISTS deleted_at,
DROP COLUMN IF EXISTS is_deleted;
```

---

## RLS Policy Updates

The existing RLS policies on the documents table should work correctly with soft-delete columns. However, verify that:

1. **SELECT policy** - Should allow users to see their tenant's documents (including soft-deleted ones if they have the ID)
2. **INSERT policy** - No changes needed
3. **UPDATE policy** - Consider adding a policy for soft-delete operations:

```sql
-- UPDATE Policy for soft-delete (optional - depends on implementation approach)
CREATE POLICY documents_update_soft_delete
ON public.documents
FOR UPDATE
USING (
    tenant_id = current_tenant_id_or_null()
    AND is_deleted = false
)
WITH CHECK (
    tenant_id = current_tenant_id_or_null()
);
```

---

## Implementation Considerations

### 1. List Queries (GET /documents)

**Default behavior (non-admin users):**
```sql
SELECT * FROM documents
WHERE tenant_id = $1
  AND is_deleted = false
ORDER BY created_at DESC;
```

**Admin with `includeDeleted=true`:**
```sql
SELECT * FROM documents
WHERE tenant_id = $1
ORDER BY created_at DESC;
```

### 2. Soft-Delete Operation (DELETE /documents/:id)

**Update query:**
```sql
UPDATE documents
SET 
    is_deleted = true,
    deleted_at = NOW(),
    deleted_by = $2,
    updated_at = NOW()
WHERE id = $1
  AND tenant_id = $3
  AND is_deleted = false
RETURNING id, deleted_at;
```

**Check for already deleted:**
- If UPDATE returns 0 rows and document exists, return 409 Conflict
- If document doesn't exist at all, return 404 Not Found

### 3. Document Retrieval (GET /documents/:id)

**No filter on `is_deleted`:**
```sql
SELECT 
    d.*,
    u.id as "createdByUser.id",
    u.email as "createdByUser.email",
    u.first_name as "createdByUser.firstName",
    u.last_name as "createdByUser.lastName",
    t.key as template_key,
    tv.version as template_version
FROM documents d
LEFT JOIN users u ON d.created_by = u.id
LEFT JOIN templates t ON d.template_id = t.id
LEFT JOIN template_versions tv ON d.template_version_id = tv.id
WHERE d.id = $1
  AND d.tenant_id = $2;
```

Soft-deleted documents remain accessible by ID for audit purposes.

---

## Storage Considerations

### File Deletion Policy

**Important:** Soft-deleted documents should **NOT** delete files from S3 storage.

**Reasons:**
1. Legal compliance and audit trail requirements
2. Potential document recovery needs
3. Forensic analysis capabilities

**Future Consideration:**
Implement a separate cleanup job/cron that:
- Runs periodically (e.g., monthly)
- Permanently deletes files for documents soft-deleted > N days ago (configurable)
- Requires explicit admin approval or automated policy

### Preview File Storage

Preview files (POST /documents/preview) should be stored separately:

**Recommended structure:**
```
{bucket-name}/
├── documents/          # Permanent documents
│   └── {document-id}/
│       ├── file.docx
│       └── file.pdf
└── previews/           # Temporary previews
    └── {temp-uuid}.{ext}
```

**S3 Lifecycle Policy for Previews:**
```json
{
  "Rules": [
    {
      "Id": "DeletePreviewsAfter1Day",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "previews/"
      },
      "Expiration": {
        "Days": 1
      }
    }
  ]
}
```

---

## Service Dependencies

The DocumentsService implementation will require:

1. **DatabaseService** - Database operations
2. **StorageService** - S3/MinIO file operations
3. **TemplatesService** - Template retrieval and validation
4. **DocumentGenerationService** - Document generation logic (may already exist in templates module)

### Module Imports

Update `documents.module.ts`:

```typescript
@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    TemplatesModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
```

---

## Authorization & Guards

### Role Requirements

| Endpoint | Allowed Roles | Notes |
|----------|--------------|-------|
| POST /preview | admin, member | Regular users can preview |
| POST /generate | admin, member | Regular users can generate |
| GET / | all authenticated | All users can list their docs |
| GET /:id | all authenticated | All users can view their docs |
| DELETE /:id | **admin only** | Only admins can delete |

### Additional Guards

1. **DocumentLimitGuard** - Already exists for storage, may need updates for documents
2. **TenantOwnershipGuard** - Verify document belongs to user's tenant (GET /:id)

---

## Error Handling

### Custom Exceptions

Consider creating domain-specific exceptions:

```typescript
// src/modules/documents/exceptions/
export class DocumentNotFoundException extends NotFoundException {
  constructor(documentId: string) {
    super(`Document with ID ${documentId} not found`);
  }
}

export class DocumentAlreadyDeletedException extends ConflictException {
  constructor(documentId: string) {
    super(`Document with ID ${documentId} is already deleted`);
  }
}

export class DocumentLimitExceededException extends ForbiddenException {
  constructor(limit: number) {
    super(`Document generation limit (${limit}) exceeded for current plan`);
  }
}
```

---

## Testing Considerations

### E2E Test Scenarios

1. **Preview Generation**
   - Valid preview request returns temporary URL
   - Invalid template key returns 404
   - Unauthorized user returns 401

2. **Document Generation**
   - Single format (DOCX only)
   - Multiple formats (DOCX + PDF)
   - Document limit enforcement
   - Invalid variables return 400

3. **Document Listing**
   - Default excludes deleted documents
   - Admin with `includeDeleted=true` sees deleted
   - Pagination works correctly
   - Filtering by template key

4. **Document Retrieval**
   - Active document returns full details
   - Soft-deleted document still accessible by ID
   - Cross-tenant access blocked (403)

5. **Soft-Delete**
   - Admin can delete document
   - Non-admin cannot delete (403)
   - Double-delete returns 409 Conflict
   - Deleted document disappears from list
   - Deleted document still accessible by ID

---

## Migration File Naming

Create migration file:
```
scripts/migrations/008_documents_soft_delete.sql
```

Update migration runner to include new migration.

---

## Documentation Updates

After implementation, update:

1. **README.md** - Add documents endpoints to API documentation
2. **docs/DATABASE.md** - Document soft-delete columns
3. **Swagger** - Should auto-update from controller annotations
4. **Postman Collection** - Add documents endpoints

---

## Implementation Checklist

- [ ] Create database migration `008_documents_soft_delete.sql`
- [ ] Run migration on development database
- [ ] Implement DocumentsService methods
- [ ] Add service dependencies (Database, Storage, Templates)
- [ ] Implement preview file storage logic
- [ ] Implement document generation with format selection
- [ ] Add document limit enforcement
- [ ] Implement soft-delete logic
- [ ] Add tenant ownership verification
- [ ] Create E2E tests
- [ ] Test with Swagger UI
- [ ] Update Postman collection
- [ ] Verify RLS policies work correctly
- [ ] Test cross-tenant isolation
- [ ] Performance test with large document lists
- [ ] Document any edge cases discovered

---

**Status:** Contract definition complete, awaiting implementation phase.

**Created:** January 21, 2026
