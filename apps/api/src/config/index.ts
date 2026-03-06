import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ─── Helper ────────────────────────────────────────────────────────────────────
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
  return val ? parseInt(val, 10) : fallback;
}

// ─── Config ────────────────────────────────────────────────────────────────────
export const config = {
  env: optional('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  isDev: optional('NODE_ENV', 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',

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
    secret: optional('JWT_SECRET', 'dev-secret-change-in-production'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '30d'),
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
    level: optional('LOG_LEVEL', 'debug'),
    file: optional('LOG_FILE', 'logs/app.log'),
  },

  cors: {
    origins: optional('ALLOWED_ORIGINS', 'http://localhost:3000').split(','),
  },
} as const;

export type Config = typeof config;
