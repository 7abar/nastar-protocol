/**
 * Strip sensitive fields from database objects before sending to clients.
 * NEVER send api_key, llm_api_key, agent_private_key, or private_key to frontend.
 */

const SENSITIVE_FIELDS = [
  "api_key",
  "llm_api_key",
  "agent_private_key",
  "private_key",
  "apiKey",
  "llmApiKey",
  "agentPrivateKey",
  "privateKey",
  "secret",
  "password",
  "token",
];

export function sanitize<T extends Record<string, any>>(obj: T): Omit<T, typeof SENSITIVE_FIELDS[number]> {
  if (!obj || typeof obj !== "object") return obj;

  const clean = { ...obj };
  for (const field of SENSITIVE_FIELDS) {
    if (field in clean) {
      delete (clean as any)[field];
    }
  }
  return clean;
}

export function sanitizeArray<T extends Record<string, any>>(arr: T[]): T[] {
  return arr.map(sanitize) as T[];
}
