# Known Issues and Solutions

This document tracks recurring issues in the Complytude codebase and their solutions.

## Critical Issues

### ⚠️ I18N Path Resolution Error (RECURRING - 2 INSTANCES)

**Severity:** HIGH  
**Impact:** Application fails to start  
**Frequency:** Occurred 2 times (2026-02-07, 2026-02-08)  
**Root Cause:** Incorrect path resolution in `apps/api/src/i18n/i18n.module.ts`

---

#### Issue Description

When starting the API in watch mode with NestJS CLI (`nest start api --watch`), the application fails with:

```
I18nError: i18n path (C:\Users\DELL\Desktop\wOrK\dist\apps\api\apps\api\src\i18n\locales\) cannot be found
```

**Key Observation:** The path contains **duplicate** `apps/api/` segments:
```
C:\Users\DELL\Desktop\wOrK\dist\apps\api\apps\api\src\i18n\locales\
                                      ^^^^^^^^^
                                      Duplicated!
```

---

#### Instance #1: Audit Module Implementation (2026-02-07)

**Context:** Implementing audit logging feature

**Error:**
```
I18nError: i18n path (C:\Users\DELL\Desktop\wOrK\dist\apps\api\apps\api\src\i18n\locales\) cannot be found
    at I18nJsonLoader.parseTranslations
    at async I18nJsonLoader.load
    at async I18nService.refresh
    at async I18nModule.onModuleInit
```

**Original Code:**
```typescript
// apps/api/src/i18n/i18n.module.ts
loaderOptions: {
  path: path.join(__dirname, 'locales/'),  // ❌ Wrong - uses __dirname
  watch: process.env.NODE_ENV !== 'production',
},
```

**Solution Applied:**
```typescript
// apps/api/src/i18n/i18n.module.ts
loaderOptions: {
  path: path.join(process.cwd(), 'apps/api/src/i18n/locales/'),  // ✅ Correct
  watch: process.env.NODE_ENV !== 'production',
},
```

**Result:** Application started successfully

---

#### Instance #2: Logging Module Implementation (2026-02-08)

**Context:** Implementing nestjs-pino structured logging

**Error:**
```
I18nError: i18n path (C:\Users\DELL\Desktop\wOrK\dist\apps\api\apps\api\src\i18n\locales\) cannot be found
    at I18nJsonLoader.parseTranslations
    at async I18nJsonLoader.load
    at async I18nService.refresh
    at async I18nModule.onModuleInit
```

**Trigger:** The error reappeared when implementing logging changes

**Original Code (had reverted):**
```typescript
// apps/api/src/i18n/i18n.module.ts
loaderOptions: {
  path: path.join(__dirname, 'locales/'),  // ❌ Wrong - reverted somehow
  watch: process.env.NODE_ENV !== 'production',
},
```

**Solution Applied (Again):**
```typescript
// apps/api/src/i18n/i18n.module.ts
loaderOptions: {
  path: path.join(process.cwd(), 'apps/api/src/i18n/locales/'),  // ✅ Correct
  watch: process.env.NODE_ENV !== 'production',
},
```

**Result:** Application started successfully

---

#### Root Cause Analysis

**Why `__dirname` Fails:**

In NestJS watch mode with monorepo structure:
1. TypeScript compiles to `dist/apps/api/`
2. `__dirname` resolves to `dist/apps/api/apps/api/src/i18n/` (nested!)
3. The path duplication causes file not found error

**Why `process.cwd()` Works:**

1. `process.cwd()` always points to project root: `C:\Users\DELL\Desktop\wOrK\`
2. Absolute path: `C:\Users\DELL\Desktop\wOrK\apps\api\src\i18n\locales/`
3. Works in both development and production modes
4. Unaffected by compilation output directory

---

#### Permanent Solution

**✅ DO THIS (Permanent Fix):**
```typescript
// apps/api/src/i18n/i18n.module.ts
import * as path from 'path';

loaderOptions: {
  path: path.join(process.cwd(), 'apps/api/src/i18n/locales/'),
  watch: process.env.NODE_ENV !== 'production',
},
```

**❌ NEVER DO THIS:**
```typescript
// DON'T USE __dirname in monorepo watch mode!
loaderOptions: {
  path: path.join(__dirname, 'locales/'),  // ❌ Causes path duplication
  watch: process.env.NODE_ENV !== 'production',
},
```

---

#### Prevention Checklist

When working with file paths in NestJS monorepo:

- [ ] **Use `process.cwd()`** for absolute paths from project root
- [ ] **Avoid `__dirname`** in watch mode (causes path duplication)
- [ ] **Test in watch mode** (`nest start --watch`) before committing
- [ ] **Verify paths** with `console.log` if unsure
- [ ] **Use absolute paths** for critical resources (i18n, assets, templates)

---

#### Related Files

**Files Affected:**
- `apps/api/src/i18n/i18n.module.ts` - I18n configuration
- `dist/apps/api/apps/api/src/i18n/locales/` - Problematic output path

**Similar Patterns to Check:**
- Any file using `__dirname` with `path.join()`
- Asset loading (templates, static files)
- Configuration file loading

---

#### Impact Assessment

| Metric | Value |
|--------|-------|
| Incidents | 2 (within 2 days) |
| Mean Time to Detect | < 5 minutes (immediate on startup) |
| Mean Time to Resolve | ~15 minutes (once identified) |
| Services Affected | API Gateway only |
| User Impact | Application won't start |
| Data Loss Risk | None (startup error) |

---

#### Action Items

- [x] Document this issue (this file)
- [x] Fix `apps/api/src/i18n/i18n.module.ts` permanently
- [ ] Search codebase for other `__dirname` usages
- [ ] Add to code review checklist: "Check __dirname usage"
- [ ] Consider adding linting rule for `__dirname` in monorepo
- [ ] Add unit test for i18n path resolution

---

#### Search for Similar Issues

```bash
# Find all __dirname usage that might cause similar issues
grep -r "__dirname" apps/ --include="*.ts"

# Focus on path.join with __dirname
grep -r "path.join(__dirname" apps/ --include="*.ts"
```

**Review these files for potential issues!**

---

## Future Prevention

### Linting Rule (Proposed)

```javascript
// eslint.config.mjs
{
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "CallExpression[callee.object.name='path'][callee.property.name='join'] > Identifier[name='__dirname']",
        message: 'Avoid path.join(__dirname) in monorepo. Use process.cwd() instead.',
      },
    ],
  },
}
```

### Code Review Checklist Item

**Add to CONTRIBUTING.md:**

> ⚠️ **Path Resolution in Monorepo:**  
> - Use `process.cwd()` for absolute paths from project root
> - Avoid `__dirname` in file loading (causes path duplication in watch mode)
> - Always test with `nest start --watch` before committing

---

## Related Documentation

- [Project Structure](PROJECT_STRUCTURE.md) - Monorepo layout
- [Architecture](ARCHITECTURE.md) - System architecture
- [Development Guide](../apps/api/docs/DEVELOPMENT.md) - Dev workflow

---

**Last Updated:** February 8, 2026  
**Status:** Active Monitoring  
**Next Review:** After 30 days or next occurrence
