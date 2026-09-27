import { SESSION_KEYS, SESSION_LIMIT_LUA_SCRIPT } from './session.constants';

describe('SESSION_LIMIT_LUA_SCRIPT key consistency', () => {
  const luaKeyPrefixes = [
    'identity-session:',
    'tenant-session:',
    'user:tenant-sessions:',
  ];

  it.each(luaKeyPrefixes)(
    'Lua script must reference key prefix "%s"',
    (prefix) => {
      expect(SESSION_LIMIT_LUA_SCRIPT).toContain(`'${prefix}'`);
    },
  );

  it('SESSION_KEYS functions produce keys starting with the expected prefixes', () => {
    expect(SESSION_KEYS.identitySession('abc')).toBe('identity-session:abc');
    expect(SESSION_KEYS.tenantSession('abc')).toBe('tenant-session:abc');
    expect(SESSION_KEYS.userTenantSessions('uid', 'tid')).toBe(
      'user:tenant-sessions:uid:tid',
    );
  });

  it('Lua script key literals must match SESSION_KEYS prefixes', () => {
    const luaStringLiterals =
      SESSION_LIMIT_LUA_SCRIPT.match(/ARGV\[4\]\s*\.\.\s*'([^']+)'/g) ?? [];
    const extractedPrefixes = luaStringLiterals.map((match) => {
      const m = match.match(/'([^']+)'/);
      return m ? m[1] : '';
    });

    for (const extracted of extractedPrefixes) {
      const matchesKnown = luaKeyPrefixes.some((kp) =>
        extracted.startsWith(kp),
      );
      expect(matchesKnown).toBe(true);
    }
  });
});
