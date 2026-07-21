// personal values live in .env (see .env.example), never in code
export const SITE_TITLE = process.env.PUBLIC_SITE_TITLE ?? 'My Desktop';

// start-menu bio text size (px), tunable from the admin Bio tab
export const BIO_FONT_SIZE_MIN = 10;
export const BIO_FONT_SIZE_MAX = 28;
export const bioFontSize = (v: string | undefined) =>
  Math.min(BIO_FONT_SIZE_MAX, Math.max(BIO_FONT_SIZE_MIN, Number(v) || 14));
