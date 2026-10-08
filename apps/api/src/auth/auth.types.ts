export type AuthenticatedIdentity = {
  userId: string;
  sessionId: string;
};

export type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  authenticatedIdentity?: AuthenticatedIdentity;
};

export type CookieResponse = {
  setHeader(name: string, value: string): void;
};
