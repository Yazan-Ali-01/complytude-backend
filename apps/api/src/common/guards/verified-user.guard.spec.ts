import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { User } from 'src/modules/users/entities/user.entity';
import type { UserRepository } from 'src/repositories/users/user.repository';
import { VerifiedUserGuard } from './verified-user.guard';

function contextFor(identity?: {
  userId: string;
  isVerified: boolean;
}): ExecutionContext {
  const request = { auth: identity ? { identity } : undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardWith(user: Partial<User> | null): {
  guard: VerifiedUserGuard;
  findById: jest.Mock;
} {
  const findById = jest.fn().mockResolvedValue(user);
  const guard = new VerifiedUserGuard({
    findById,
  } as unknown as UserRepository);
  return { guard, findById };
}

describe('VerifiedUserGuard', () => {
  it('allows a user whose email is verified in the database', async () => {
    const { guard, findById } = guardWith({ id: 'u1', is_verified: true });

    await expect(
      guard.canActivate(contextFor({ userId: 'u1', isVerified: false })),
    ).resolves.toBe(true);
    expect(findById).toHaveBeenCalledWith('u1');
  });

  it('denies an unverified user even when the JWT claims verified', async () => {
    const { guard } = guardWith({ id: 'u1', is_verified: false });

    await expect(
      guard.canActivate(contextFor({ userId: 'u1', isVerified: true })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a user that no longer exists', async () => {
    const { guard } = guardWith(null);

    await expect(
      guard.canActivate(contextFor({ userId: 'gone', isVerified: true })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a request without an identity, without querying', async () => {
    const { guard, findById } = guardWith({ id: 'u1', is_verified: true });

    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findById).not.toHaveBeenCalled();
  });
});
