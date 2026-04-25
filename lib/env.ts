type RequiredEnvironmentVariable =
  | "NEXT_PUBLIC_APP_ENV"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY";

function getRequiredEnv(name: RequiredEnvironmentVariable): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getPublicEnvironment() {
  const appEnvironment = getRequiredEnv("NEXT_PUBLIC_APP_ENV");

  if (appEnvironment !== "development" && appEnvironment !== "production") {
    throw new Error("NEXT_PUBLIC_APP_ENV must be either development or production.");
  }

  return {
    appEnvironment,
    supabaseUrl: getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}
