import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ─── Helpers ────────────────────────────────────────────────────────────────────

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalNumber(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number, got: "${val}"`);
  }
  return parsed;
}

function optionalBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (!val) return fallback;
  return val === 'true' || val === '1';
}

// ─── Config ────────────────────────────────────────────────────────────────────

const env = optional('NODE_ENV', 'development') as 'development' | 'production' | 'test';

export const config = {
  env,
  isDev: env === 'development',
  isProd: env === 'production',
  isTest: env === 'test',

  server: {
    port: optionalNumber('PORT', 4000),
    baseUrl: optional('API_BASE_URL', 'http://localhost:4000'),
  },

  db: {
    url: required('DATABASE_URL'),
  },

  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
  },

  jwt: {
    secret: process.env['NODE_ENV'] === 'production'
      ? required('JWT_SECRET')
      : optional('JWT_SECRET', 'dev-secret-change-in-production'),
    refreshSecret: process.env['NODE_ENV'] === 'production'
      ? required('JWT_REFRESH_SECRET')
      : optional('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '30d'),
    issuer: optional('JWT_ISSUER', 'avid-api'),
    audience: optional('JWT_AUDIENCE', 'avid-app'),
  },

  aws: {
    region: optional('AWS_REGION', 'us-east-1'),
    accessKeyId: optional('AWS_ACCESS_KEY_ID', ''),
    secretAccessKey: optional('AWS_SECRET_ACCESS_KEY', ''),
    buckets: {
      media: optional('S3_BUCKET_MEDIA', 'avid-media-assets'),
      proxies: optional('S3_BUCKET_PROXIES', 'avid-media-proxies'),
      exports: optional('S3_BUCKET_EXPORTS', 'avid-exports'),
    },
    cloudfrontDomain: optional('CLOUDFRONT_DOMAIN', ''),
  },

  openai: {
    apiKey: optional('OPENAI_API_KEY', ''),
    transcriptionModel: optional('OPENAI_TRANSCRIPTION_MODEL', 'whisper-1'),
    assemblyModel: optional('OPENAI_ASSEMBLY_MODEL', 'gpt-4o'),
  },

  stripe: {
    secretKey: optional('STRIPE_SECRET_KEY', ''),
    webhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),
    prices: {
      proMonthly: optional('STRIPE_PRICE_PRO_MONTHLY', ''),
      enterprise: optional('STRIPE_PRICE_ENTERPRISE', ''),
    },
  },

  email: {
    host: optional('SMTP_HOST', 'localhost'),
    port: optionalNumber('SMTP_PORT', 587),
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
    from: optional('FROM_EMAIL', 'noreply@avid.app'),
    fromName: optional('FROM_NAME', 'The Avid'),
  },

  oauth: {
    google: {
      clientId: optional('GOOGLE_CLIENT_ID', ''),
      clientSecret: optional('GOOGLE_CLIENT_SECRET', ''),
    },
  },

  publish: {
    youtube: {
      clientId: optional('YOUTUBE_CLIENT_ID', ''),
      clientSecret: optional('YOUTUBE_CLIENT_SECRET', ''),
    },
    instagram: {
      appId: optional('INSTAGRAM_APP_ID', ''),
      appSecret: optional('INSTAGRAM_APP_SECRET', ''),
    },
    tiktok: {
      clientKey: optional('TIKTOK_CLIENT_KEY', ''),
      clientSecret: optional('TIKTOK_CLIENT_SECRET', ''),
    },
  },

  ws: {
    heartbeatInterval: optionalNumber('WS_HEARTBEAT_INTERVAL', 30000),
    maxPayload: optionalNumber('WS_MAX_PAYLOAD', 52428800), // 50MB
  },

  ffmpeg: {
    path: optional('FFMPEG_PATH', 'ffmpeg'),
    probePath: optional('FFPROBE_PATH', 'ffprobe'),
  },

  rateLimit: {
    windowMs: optionalNumber('RATE_LIMIT_WINDOW_MS', 900000),
    max: optionalNumber('RATE_LIMIT_MAX', 1000),
  },

  logging: {
    level: optional('LOG_LEVEL', env === 'production' ? 'info' : 'debug'),
    file: optional('LOG_FILE', 'logs/app.log'),
  },

  cors: {
    origins: optional('ALLOWED_ORIGINS', 'http://localhost:3000').split(',').map(s => s.trim()),
  },

  security: {
    bcryptRounds: optionalNumber('BCRYPT_ROUNDS', 12),
    maxLoginAttempts: optionalNumber('MAX_LOGIN_ATTEMPTS', 10),
    lockoutDurationMs: optionalNumber('LOCKOUT_DURATION_MS', 15 * 60 * 1000),
  },
} as const;

// ─── Production safety checks ─────────────────────────────────────────────────

if (config.isProd) {
  if (config.jwt.secret === 'dev-secret-change-in-production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  if (config.jwt.secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  if (config.jwt.refreshSecret === 'dev-refresh-secret-change-in-production') {
    throw new Error('JWT_REFRESH_SECRET must be set in production');
  }
  if (config.jwt.refreshSecret.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters in production');
  }
  if (!config.cors.origins.length || config.cors.origins.includes('*')) {
    throw new Error('ALLOWED_ORIGINS must be explicitly set in production (no wildcards)');
  }
}

// Warn in development/staging if using default secret
if (!config.isTest && !config.isProd) {
  if (config.jwt.secret === 'dev-secret-change-in-production') {
    console.warn('[SECURITY] Using default JWT_SECRET -- set JWT_SECRET env var before deploying');
  }
}

export type Config = typeof config;
