const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export type EmbedEndpointSkipReason =
  | "missing"
  | "invalid"
  | "non-loopback"
  | "serverless-loopback-disabled";

export type EmbedEndpointResolution =
  | { endpoint: string; reason: null }
  | { endpoint: null; reason: EmbedEndpointSkipReason };

type EnvLike = Record<string, string | undefined>;

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
}

function isTruthy(value: string | undefined): boolean {
  return TRUE_VALUES.has(value?.toLowerCase() ?? "");
}

function isServerlessRuntime(env: EnvLike): boolean {
  return (
    isTruthy(env.NETLIFY) ||
    isTruthy(env.VERCEL) ||
    Boolean(env.AWS_LAMBDA_FUNCTION_NAME || env.AWS_EXECUTION_ENV)
  );
}

export function describeEmbedSkipReason(reason: EmbedEndpointSkipReason): string {
  switch (reason) {
    case "missing":
      return "not configured";
    case "invalid":
      return "invalid EMBED_SERVER_URL";
    case "non-loopback":
      return "non-loopback EMBED_SERVER_URL";
    case "serverless-loopback-disabled":
      return "loopback EMBED_SERVER_URL disabled in serverless runtime";
  }
}

export function resolveLoopbackEmbedEndpoint({
  raw,
  fallback,
  path,
  env = process.env,
}: {
  raw: string | undefined;
  fallback?: string;
  path: string;
  env?: EnvLike;
}): EmbedEndpointResolution {
  const source = raw ?? fallback;
  if (!source) return { endpoint: null, reason: "missing" };

  try {
    const url = new URL(source);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    const isLoopback = LOOPBACK_HOSTS.has(normalizeHostname(url.hostname));

    if (!isHttp) return { endpoint: null, reason: "invalid" };
    if (!isLoopback) return { endpoint: null, reason: "non-loopback" };
    if (isServerlessRuntime(env) && !isTruthy(env.EMBED_SERVER_LOOPBACK_ENABLED)) {
      return { endpoint: null, reason: "serverless-loopback-disabled" };
    }

    return { endpoint: new URL(path, url).toString(), reason: null };
  } catch {
    return { endpoint: null, reason: "invalid" };
  }
}
