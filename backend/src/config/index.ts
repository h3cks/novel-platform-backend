import dotenv from 'dotenv';
dotenv.config();

function toNumber(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const DATABASE_URL = process.env.DATABASE_URL ?? '';
export const JWT_SECRET = process.env.JWT_SECRET ?? 'change_me';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';
export const BCRYPT_SALT_ROUNDS = toNumber(process.env.BCRYPT_SALT_ROUNDS, 10);


export const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Novel Platform <no-reply@example.com>';
export const SMTP_HOST = process.env.SMTP_HOST ?? '';
export const SMTP_PORT = toNumber(process.env.SMTP_PORT, 587);
export const SMTP_USER = process.env.SMTP_USER ?? '';
export const SMTP_PASS = process.env.SMTP_PASS ?? '';

export const EMAIL_CONFIRM_TOKEN_TTL_HOURS = toNumber(process.env.EMAIL_CONFIRM_TOKEN_TTL_HOURS, 24);
export const PASSWORD_RESET_TOKEN_TTL_HOURS = toNumber(process.env.PASSWORD_RESET_TOKEN_TTL_HOURS, 1);

export const MIN_WORDS_TOTAL = toNumber(process.env.MIN_WORDS_TOTAL, 2000);
export const MIN_CHAPTERS = toNumber(process.env.MIN_CHAPTERS, 1);
export const MIN_WORDS_PER_CHAPTER = toNumber(process.env.MIN_WORDS_PER_CHAPTER, 100);
export const MAX_EXTERNAL_LINKS = toNumber(process.env.MAX_EXTERNAL_LINKS, 5);
export const MAX_COMPARE_CHAPTERS = toNumber(process.env.MAX_COMPARE_CHAPTER, 50);
export const DUPLICATE_CONTENT_THRESHOLD = Number(process.env.DUPLICATE_CONTENT_THRESHOLD ?? 0.6);
export const LANG_DETECTION_ENABLED = process.env.LANG_DETECTION_ENABLED ?? 'false';
export const LANG_DETECTION_RATIO = Number(process.env.LANG_DETECTION_RATIO ?? 0.6);


export const REPORT_THRESHOLD = Number(process.env.REPORT_THRESHOLD ?? 3);
export const MAX_REPORTS_PER_USER_PER_DAY = Number(process.env.MAX_REPORTS_PER_USER_PER_DAY ?? 20);



export const REPORTS_PER_USER_PER_PERIOD = toNumber(process.env.REPORTS_PER_USER_PER_PERIOD, 10);
export const REPORTS_PERIOD_HOURS = toNumber(process.env.REPORTS_PERIOD_HOURS, 24);

export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
export const API_URL = process.env.API_URL ?? `http://localhost:${PORT}`;

if (NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production');
  }
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL must be set in production');
  }
}