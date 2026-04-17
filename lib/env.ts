export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is not configured`);
  }
  return value;
}

export function getOptionalEnv(name: string, defaultValue = ""): string {
  return process.env[name]?.trim() || defaultValue;
}
