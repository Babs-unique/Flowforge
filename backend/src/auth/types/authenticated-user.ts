export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  sessionId: string;
}

export type PublicUser = Omit<AuthenticatedUser, 'sessionId'>;
