# Internationalization (i18n) Implementation Guide

This guide covers how the Complytude API implements and uses internationalization (i18n) for translations and localization.

## Overview

The API uses the **nestjs-i18n** library with the following structure:

- **Translation keys** are defined in module-specific constants: `modules/{module}/constants/i18n.constants.ts`
- **Locale files** (JSON) store actual translations: `i18n/locales/{lang}/{module}.json`
- **Type-safe keys** are exported from `common/constants/i18n-keys.ts` for use throughout the application

## Architecture

### Key Principles

1. **Module-Based Organization**: Each feature module has its own i18n constants and translations
2. **Nested Structure**: Keys are organized under `errors` and `messages` categories
3. **Type Safety**: `I18nKeyType` union ensures all keys are valid at compile time
4. **Backward Compatibility**: Legacy `I18nKeys` flat object is maintained but deprecated

### Directory Structure

```
apps/api/src/
├── common/constants/
│   └── i18n-keys.ts                      # Main i18n entry point (re-exports + type definitions)
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

### Step 3: Update i18n-keys.ts

Add the new module to `common/constants/i18n-keys.ts`:

```typescript
// Import
import { AuthI18n } from '../../modules/auth/constants/i18n.constants';

// Export
export {
  AuthI18n,
  // ... other modules
};

// Add to I18nKeys legacy object
export const I18nKeys = {
  // ... existing keys
  EMAIL_ALREADY_REGISTERED: 'auth.errors.EMAIL_ALREADY_REGISTERED',
  INVALID_CREDENTIALS: 'auth.errors.INVALID_CREDENTIALS',
};

// Add to I18nKeyType union
export type I18nKeyType =
  | ExtractValues<typeof AuthI18n>
  | ExtractValues<typeof OtherI18n>;
```

## Using Translations in Services

### Injecting I18nService

```typescript
import { I18n, I18nService } from 'nestjs-i18n';
import { I18nKeys } from 'src/common/constants/i18n-keys';

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
  this.i18n.t(I18nKeys.EMAIL_NOT_VERIFIED),
);
```

**Parametrized message:**

```typescript
throw new BadRequestException(
  this.i18n.t(I18nKeys.USER_NOT_FOUND, {
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

**Option 1: Direct Translation (Simple Errors)**

```typescript
async updateUser(userId: string) {
  const user = await this.usersRepository.findById(userId);
  if (!user) {
    throw new NotFoundException(this.i18n.t(I18nKeys.USER_NOT_FOUND));
  }
}
```

**Option 2: Abstracted Error Handler (Complex Logic)**

Used in services like `CategoriesService` for more complex error scenarios:

```typescript
private async handleError(i18nKey: string, context?: string): never {
  this.logger.error(`Operation failed: ${context}`);
  throw new BadRequestException(this.i18n.t(i18nKey));
}

// Usage in methods:
try {
  // ... operation ...
} catch (error) {
  this.handleError(I18nKeys.OPERATION_FAILED, 'creating category');
}
```

**When to use the abstracted pattern:**
- Multiple related errors in the same method
- Error handler needs additional logic (logging, metrics)
- Reducing code duplication across similar operations

## Parametrized Messages

Messages can accept dynamic parameters using single-brace placeholders:

**TypeScript:**

```typescript
this.i18n.t(I18nKeys.INVITATION_WRONG_STATUS, {
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
- ✅ Use `I18nKeys` for type safety (avoids typos at runtime)
- ✅ Keep error messages user-friendly and non-technical
- ✅ Use parametrized messages for dynamic content
- ✅ Maintain consistency in error message tone across modules
- ✅ Test translations in both languages before committing
- ✅ Keep JSON locale files well-organized under `errors`/`messages`

### DON'T ❌

- ❌ Use hardcoded strings in exceptions (always use `i18n.t()`)
- ❌ Create keys inline without adding them to constants
- ❌ Mix double braces (`{{var}}`) and single braces (`{var}`) in JSON
- ❌ Translate technical terms or API field names
- ❌ Forget to add both English and Arabic translations

## Common Patterns

### Pattern 1: Not Found + Parameter

```typescript
const user = await this.usersRepository.findById(userId);
if (!user) {
  throw new NotFoundException(
    this.i18n.t(I18nKeys.USER_NOT_FOUND, {
      args: { userId },
    }),
  );
}
```

### Pattern 2: Already Exists + Name

```typescript
const existing = await this.repository.findByKey(key);
if (existing) {
  throw new ConflictException(
    this.i18n.t(I18nKeys.ITEM_ALREADY_EXISTS, {
      args: { name: key },
    }),
  );
}
```

### Pattern 3: Permission Denied + Context

```typescript
if (!hasPermission) {
  throw new ForbiddenException(
    this.i18n.t(I18nKeys.ACCESS_DENIED, {
      args: { resource: 'categories' },
    }),
  );
}
```

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

// 3. Update i18n-keys.ts and service
throw new NotFoundException(
  this.i18n.t(I18nKeys.USER_NOT_FOUND),
);
```

## Architecture Considerations

### Current Structure vs. Future Scalability

**Current approach:** Single flat `I18nKeys` object in `common/constants/i18n-keys.ts`

**Pros:**
- Simple to use
- Type-safe through `I18nKeyType` union
- Easy to search all keys in one place

**Cons:**
- File grows with each new module
- Can become difficult to maintain as codebase scales

**Future improvement option:** Split into per-module key files when:
- The `i18n-keys.ts` file exceeds 500 lines
- Team prefers importing directly from module files: `import { AuthI18n } from 'modules/auth/constants/i18n.constants'`

This is tracked as a potential optimization but not required for the current phase.

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
        I18nKeys.INVALID_CREDENTIALS,
      );
    }
  });
});
```

## Troubleshooting

### Issue: Translation not showing

**Solution:** Verify:
- Key exists in locale JSON file
- JSON syntax is valid (use JSON validator)
- Module is imported in `i18n-keys.ts`
- Language file exists (e.g., both `en/` and `ar/`)

### Issue: Parameter not replaced

**Solution:** Check:
- Placeholder uses single braces: `{param}` not `{{param}}`
- Placeholder name matches: `i18n.t(key, { args: { param: value } })`
- No typos in placeholder names

### Issue: Circular imports

**Solution:**
- Don't import `I18nKeys` in module constants
- Import module constants in `i18n-keys.ts` instead

---

## Related Documentation

- [API Contracts](API_CONTRACTS.md) - API standards and patterns
- [DEVELOPMENT.md](DEVELOPMENT.md) - General development guide
- [nestjs-i18n GitHub](https://github.com/toon/nestjs-i18n) - Library documentation
