export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export interface TokenClaims {
  sub: string;
  sid: string;
  tokenUse: 'access' | 'refresh';
}

export function isTokenClaims(value: unknown): value is TokenClaims {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const claims = value as Record<string, unknown>;
  return (
    typeof claims.sub === 'string' &&
    typeof claims.sid === 'string' &&
    (claims.tokenUse === 'access' || claims.tokenUse === 'refresh')
  );
}
