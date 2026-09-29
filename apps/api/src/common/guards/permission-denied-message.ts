import { I18nContext } from 'nestjs-i18n';
import { CommonI18n } from '../constants/i18n.constants';

/** The 403 message for missing permissions, in the request's language. */
export function permissionDeniedMessage(required: {
  permissions: string[];
  requireAll?: boolean;
}): string {
  const permissions = required.permissions.join(', ');
  const key = required.requireAll
    ? CommonI18n.errors.PERMISSION_REQUIRED_ALL
    : CommonI18n.errors.PERMISSION_REQUIRED_ANY;
  return (
    I18nContext.current()?.t(key, { args: { permissions } }) ??
    `Access denied. Required permissions (${required.requireAll ? 'all' : 'any'} of): ${permissions}`
  );
}
