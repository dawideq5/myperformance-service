import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      roles?: string[];
      attributes?: Record<string, string[]>;
      emailVerified?: boolean;
    };
    accessToken?: string;
    idToken?: string;
    error?: "RefreshTokenExpired" | string;
  }

  interface User {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    attributes?: Record<string, string[]>;
    emailVerified?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    expiresAt?: number;
    keycloakError?: boolean;
    userAttributes?: Record<string, string[]>;
    emailVerified?: boolean;
    sid?: string;
  }
}
