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
      sid?: string;
      session_id?: string;
    };
    accessToken?: string;
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
    expiresAt?: number;
    keycloakError?: boolean;
    sid?: string;
    error?: string;
  }
}
