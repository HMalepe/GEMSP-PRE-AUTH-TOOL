export interface AppConfig {
  port: number;
  databaseUrl: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: env.PORT ? Number(env.PORT) : 3000,
    databaseUrl: env.DATABASE_URL,
  };
}
