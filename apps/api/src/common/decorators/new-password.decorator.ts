import { applyDecorators } from '@nestjs/common';
import { IsByteLength, IsString, MinLength } from 'class-validator';

/** bcrypt ignores everything past 72 bytes, so a longer password would only look stronger. */
export const PASSWORD_MAX_BYTES = 72;

/** A password being set (signup, reset, change): 8 characters to 72 bytes. */
export function IsNewPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(8, { message: 'Password must be at least 8 characters long' }),
    IsByteLength(0, PASSWORD_MAX_BYTES, {
      message: `Password must be at most ${PASSWORD_MAX_BYTES} bytes long`,
    }),
  );
}
