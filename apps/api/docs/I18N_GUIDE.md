# Internationalization (i18n) Implementation Guide

This guide covers how the Complytude API implements and uses internationalization (i18n) for translations and localization.

## Overview

The API uses the **nestjs-i18n** library with the following structure:

- **Translation keys** are defined in module-specific constants: `modules/{module}/constants/i18n.constants.ts`
- **Locale files** (JSON) store actual translations: `i18n/locales/{lang}/{module}.json`
- **Direct imports** from module constants ensure type safety and eliminate circular dependencies

## Architecture

### Key Principles

1. **Module-Based Organization**: Each feature module has its own i18n constants and translations
2. **Nested Structure**: Keys are organized under `errors` and `messages` categories
3. **Type Safety**: TypeScript constants ensure all keys are valid at compile time
4. **Direct Imports**: Import `{Module}I18n` directly from module constants (e.g., `AuthI18n`, `UsersI18n`)
5. **Parameter Support**: All error messages support dynamic parameters using single-brace syntax `{param}`

### Directory Structure

```
apps/api/src/
├── i18n/
│   ├── i18n.module.ts                    # nestjs-i18n configuration
│   └── locales/
│       ├── en/
│       │   ├── common.json
│       │   ├── auth.json
│       │   ├── users.json
│       │   ├── templates.json
│       │   ├── storage.json
│       │   ├── tenant.json
│       │   ├── entitlements.json
│       │   ├── authorities.json
│       │   ├── categories.json
│       │   ├── documents.json
│       │   ├── invitations.json
│       │   ├── subscriptions.json
│       │   └── rulesets.json
│       └── ar/
│           └── (same files as en/ with Arabic translations)
└── modules/
    ├── auth/constants/i18n.constants.ts
    ├── users/constants/i18n.constants.ts
    ├── templates/constants/i18n.constants.ts
    ├── storage/constants/i18n.constants.ts
    ├── tenants/constants/i18n.constants.ts
    ├── entitlements/constants/i18n.constants.ts
    ├── authorities/constants/i18n.constants.ts
    ├── categories/constants/i18n.constants.ts
    ├── documents/constants/i18n.constants.ts
    ├── invitations/constants/i18n.constants.ts
    ├── subscriptions/constants/i18n.constants.ts
    └── rulesets/constants/i18n.constants.ts
```

## Defining Translation Keys

### Step 1: Create Module Constants File

Create `modules/{module}/constants/i18n.constants.ts`:

```typescript
/**
 * Auth module i18n translation keys
 */
export const AuthI18n = {
  errors: {
    EMAIL_ALREADY_REGISTERED: 'auth.errors.EMAIL_ALREADY_REGISTERED',
    INVALID_CREDENTIALS: 'auth.errors.INVALID_CREDENTIALS',
    EMAIL_NOT_VERIFIED: 'auth.errors.EMAIL_NOT_VERIFIED',
  },
  messages: {
    EMAIL_VERIFIED: 'auth.messages.EMAIL_VERIFIED',
    SIGNUP_SUCCESS: 'auth.messages.SIGNUP_SUCCESS',
  },
} as const;
```

**Key Pattern:**
- Format: `{module}.{category}.{KEY_NAME}`
- Categories: `errors` or `messages`
- Module: lowercase module name
- Key: SCREAMING_SNAKE_CASE

### Step 2: Create Locale Files

Create `i18n/locales/en/{module}.json`:

```json
{
  "errors": {
    "EMAIL_ALREADY_REGISTERED": "Email is already registered",
    "INVALID_CREDENTIALS": "Invalid credentials",
    "EMAIL_NOT_VERIFIED": "Email is not verified"
  },
  "messages": {
    "EMAIL_VERIFIED": "Email verified successfully",
    "SIGNUP_SUCCESS": "Signup successful"
  }
}
```

Create the same structure in `i18n/locales/ar/{module}.json` with Arabic translations.

### Step 3: Verify Synchronization

Ensure all locale files are synchronized:

```bash
# Check that both English and Arabic have the same keys
diff <(jq -S 'keys' i18n/locales/en/{module}.json) \
     <(jq -S 'keys' i18n/locales/ar/{module}.json)
```

**Important:** Every key in the constants file MUST exist in both `en/` and `ar/` locale files.

## Using Translations in Services

### Injecting I18nService

```typescript
import { I18n, I18nService } from 'nestjs-i18n';
import { AuthI18n } from './constants/i18n.constants';

@Injectable()
export class AuthService {
  constructor(
    @I18n() private readonly i18n: I18nService,
  ) {}
}
```

### Translating Error Messages

**Simple error (no parameters):**

```typescript
throw new NotFoundException(
  this.i18n.t(AuthI18n.errors.EMAIL_NOT_VERIFIED),
);
```

**Parametrized message:**

```typescript
throw new BadRequestException(
  this.i18n.t(UsersI18n.errors.USER_NOT_FOUND, {
    args: { userId: user.id },
  }),
);
```

JSON file (with placeholder syntax using single braces):

```json
{
  "errors": {
    "USER_NOT_FOUND": "User {userId} not found"
  }
}
```

### Error Handling Pattern

**Standard Pattern (Recommended):**

```typescript
import { UsersI18n } from './constants/i18n.constants';

async updateUser(userId: string) {
  const user = await this.usersRepository.findById(userId);
  if (!user) {
    throw new NotFoundException(
      this.i18n.t(UsersI18n.errors.USER_NOT_FOUND, {
        args: { userId },
      }),
    );
  }
}
```

**Key Guidelines:**
- Always import the module's i18n constants at the top of the service
- Use the full path: `{Module}I18n.errors.ERROR_NAME` or `{Module}I18n.messages.MESSAGE_NAME`
- Pass dynamic values using the `args` object
- Keep error messages user-friendly and actionable

## Parametrized Messages

Messages can accept dynamic parameters using single-brace placeholders:

**TypeScript:**

```typescript
this.i18n.t(InvitationsI18n.errors.INVITATION_WRONG_STATUS, {
  args: { status: 'pending', action: 'accept' },
});
```

**JSON locale file:**

```json
{
  "errors": {
    "INVITATION_WRONG_STATUS": "Cannot {action} invitation with status '{status}'"
  }
}
```

**Result:**
> Cannot accept invitation with status 'pending'

## Supported Languages

Currently supported:
- **English (en)**: `i18n/locales/en/`
- **Arabic (ar)**: `i18n/locales/ar/`

To add a new language:
1. Create `i18n/locales/{lang}/` directory
2. Copy all JSON files from `en/` with translations in the new language
3. The i18n module automatically picks up the new language

## Best Practices

### DO ✅

- ✅ Define keys in module constants before using them
- ✅ Import module i18n constants directly (e.g., `import { UsersI18n } from './constants/i18n.constants'`)
- ✅ Keep error messages user-friendly and non-technical
- ✅ Use parametrized messages for dynamic content with `{param}` syntax
- ✅ Always pass parameters using `{ args: { key: value } }`
- ✅ Maintain consistency in error message tone across modules
- ✅ Test translations in both languages before committing
- ✅ Keep JSON locale files well-organized under `errors`/`messages`
- ✅ Ensure both English and Arabic locales have identical key structures

### DON'T ❌

- ❌ Use hardcoded strings in exceptions (always use `i18n.t()`)
- ❌ Create keys inline without adding them to constants
- ❌ Mix double braces (`{{var}}`) and single braces (`{var}`) in JSON (always use single braces)
- ❌ Translate technical terms or API field names
- ❌ Forget to add both English and Arabic translations
- ❌ Add parameters to locale files without passing them in the service
- ❌ Pass parameters that aren't defined in the locale file

## Common Patterns

### Pattern 1: Not Found + Parameter

```typescript
const user = await this.usersRepository.findById(userId);
if (!user) {
  throw new NotFoundException(
    this.i18n.t(UsersI18n.errors.USER_NOT_FOUND, {
      args: { userId },
    }),
  );
}
```

**Locale file:**
```json
{
  "errors": {
    "USER_NOT_FOUND": "User {userId} not found"
  }
}
```

### Pattern 2: Already Exists + Parameter

```typescript
const existing = await this.repository.findByKey(key);
if (existing) {
  throw new ConflictException(
    this.i18n.t(TemplatesI18n.errors.TEMPLATE_ALREADY_EXISTS),
  );
}
```

### Pattern 3: Slug/Unique Field Conflict

```typescript
const isTaken = await this.tenantRepository.isSlugTaken(slug, tenantId);
if (isTaken) {
  throw new ConflictException(
    this.i18n.t(TenantsI18n.errors.SLUG_TAKEN, {
      args: { slug },
    }),
  );
}
```

**Locale file:**
```json
{
  "errors": {
    "SLUG_TAKEN": "Slug '{slug}' is already taken by another tenant"
  }
}
```

### Pattern 4: Multiple Optional Parameters

When a message can receive different parameters (e.g., `userId` OR `email`):

```typescript
// Service can pass either userId or email
this.i18n.t(UsersI18n.errors.USER_NOT_FOUND, {
  args: { userId }, // OR args: { email }
});
```

**Locale file (both parameters in template):**
```json
{
  "errors": {
    "USER_NOT_FOUND": "User {userId}{email} not found"
  }
}
```

This displays whichever parameter is provided.

## Migration from Hardcoded Strings

If you find hardcoded error strings:

### Before

```typescript
throw new NotFoundException('User not found');
```

### After

```typescript
// 1. Add to i18n constants
export const UsersI18n = {
  errors: {
    USER_NOT_FOUND: 'users.errors.USER_NOT_FOUND',
  },
};

// 2. Add to locale files
// i18n/locales/en/users.json
{
  "errors": {
    "USER_NOT_FOUND": "User not found"
  }
}

// 3. Update service
import { UsersI18n } from './constants/i18n.constants';

throw new NotFoundException(
  this.i18n.t(UsersI18n.errors.USER_NOT_FOUND),
);
```

## Architecture Considerations

### Current Structure: Module-Based Direct Imports

**Current approach:** Import i18n constants directly from each module

**Pros:**
- ✅ No central file bottleneck
- ✅ Type-safe through TypeScript constants
- ✅ Clear module ownership
- ✅ No circular dependency issues
- ✅ Easy to locate and update translations per module

**Cons:**
- ⚠️ Requires importing from each module separately
- ⚠️ No single source to view all keys (use grep/search instead)

**Key Design Decision:**
We removed the centralized `common/constants/i18n-keys.ts` file to eliminate:
- Maintenance overhead of keeping a central registry
- Risk of circular dependencies
- Merge conflicts in a single large file

Each module is now self-contained with its own i18n constants.

## Testing Translations

### Unit Test Example

```typescript
describe('AuthService', () => {
  it('should throw with translated error on invalid credentials', async () => {
    const i18nService = {
      t: jest.fn(() => 'Invalid credentials'),
    };

    try {
      // ... trigger error ...
    } catch (error) {
      expect(i18nService.t).toHaveBeenCalledWith(
        AuthI18n.errors.INVALID_CREDENTIALS,
      );
    }
  });
});
```

## Troubleshooting

### Issue: Translation not showing

**Solution:** Verify:
- Key exists in module's `i18n.constants.ts` file
- Key exists in locale JSON file for both `en/` and `ar/`
- JSON syntax is valid (use JSON validator)
- Module constant is imported in the service
- Language file exists (e.g., both `en/` and `ar/`)

### Issue: Parameter not replaced

**Solution:** Check:
- Placeholder uses single braces: `{param}` not `{{param}}`
- Placeholder name matches: `i18n.t(key, { args: { param: value } })`
- No typos in placeholder names

### Issue: Missing parameter in translation

**Symptoms:**
- Parameter shows as literal `{userId}` instead of the actual value
- Translation displays `User {userId} not found` instead of `User 123 not found`

**Solution:**
- Ensure you're passing the parameter: `this.i18n.t(key, { args: { userId: '123' } })`
- Check parameter name matches exactly between service and locale file
- Verify you're using single braces `{param}` not double braces `{{param}}`

### Issue: Key mismatch between constants and locales

**Solution:**
- Run a consistency check across all modules
- Ensure every key in `i18n.constants.ts` exists in both `en/{module}.json` and `ar/{module}.json`
- Use the same key names (case-sensitive) across all files

## Module Status Reference

All modules have synchronized i18n constants and locale files:

| Module | Constants File | EN Locale | AR Locale | Status |
|--------|---------------|-----------|-----------|--------|
| auth | ✅ | ✅ | ✅ | Synced |
| users | ✅ | ✅ | ✅ | Synced |
| tenants | ✅ | ✅ | ✅ | Synced |
| templates | ✅ | ✅ | ✅ | Synced |
| authorities | ✅ | ✅ | ✅ | Synced |
| categories | ✅ | ✅ | ✅ | Synced |
| documents | ✅ | ✅ | ✅ | Synced |
| entitlements | ✅ | ✅ | ✅ | Synced |
| invitations | ✅ | ✅ | ✅ | Synced |
| rulesets | ✅ | ✅ | ✅ | Synced |
| storage | ✅ | ✅ | ✅ | Synced |
| subscriptions | ✅ | ✅ | ✅ | Synced |

**Last Updated:** 2026-03-09

---

## Related Documentation

- [API Contracts](API_CONTRACTS.md) - API standards and patterns
- [DEVELOPMENT.md](DEVELOPMENT.md) - General development guide
- [nestjs-i18n GitHub](https://github.com/toon/nestjs-i18n) - Library documentation
