/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    KEYCLOAK_URL: process.env.KEYCLOAK_URL,
    KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET,
    NEXT_PUBLIC_KEYCLOAK_URL: process.env.NEXT_PUBLIC_KEYCLOAK_URL || process.env.KEYCLOAK_URL,
  },
};

module.exports = nextConfig;
