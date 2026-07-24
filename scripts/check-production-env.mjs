const required = [
  'PRODUCT_NAME',
  'CLIENT_URL',
  'APP_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MAIL_FROM',
];

const placeholders = /(?:example\.com|your-project|your-service|replace-with|development-placeholder)/i;
const errors = [];

for (const key of required) {
  const value = process.env[key]?.trim();
  if (!value) errors.push(`${key} is missing`);
  else if (placeholders.test(value)) errors.push(`${key} still contains a placeholder`);
}

for (const key of ['CLIENT_URL', 'APP_URL']) {
  const values = (process.env[key] ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (values.some((value) => !value.startsWith('https://'))) errors.push(`${key} must use HTTPS in production`);
}

if ((process.env.JWT_ACCESS_SECRET?.length ?? 0) < 32) errors.push('JWT_ACCESS_SECRET must contain at least 32 characters');
if ((process.env.JWT_REFRESH_SECRET?.length ?? 0) < 32) errors.push('JWT_REFRESH_SECRET must contain at least 32 characters');
if (process.env.JWT_ACCESS_SECRET && process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
  errors.push('JWT access and refresh secrets must be different');
}
if (process.env.COOKIE_SECURE !== 'true') errors.push('COOKIE_SECURE must be true');
if (process.env.REQUIRE_EMAIL_VERIFICATION !== 'true') errors.push('REQUIRE_EMAIL_VERIFICATION must be true for a sale candidate');

const transport = process.env.MAIL_TRANSPORT;
const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const hasGmail = Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_SENDER);
const hasBrevo = Boolean(process.env.BREVO_API_KEY);
if (!transport) errors.push('MAIL_TRANSPORT must select gmail-api, smtp, or brevo');
if (transport === 'gmail-api' && !hasGmail) errors.push('Gmail API transport credentials are incomplete');
if (transport === 'smtp' && !hasSmtp) errors.push('SMTP transport credentials are incomplete');
if (transport === 'brevo' && !hasBrevo) errors.push('Brevo transport credentials are incomplete');

if (process.env.GOOGLE_AUTH_ENABLED === 'true' && !process.env.GOOGLE_AUTH_CLIENT_ID?.endsWith('.apps.googleusercontent.com')) {
  errors.push('Google authentication is enabled but GOOGLE_AUTH_CLIENT_ID is invalid');
}
if (process.env.TURN_URL && !process.env.TURN_SECRET && !(process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL)) {
  errors.push('TURN_URL requires REST or static credentials');
}
if (Boolean(process.env.VAPID_PUBLIC_KEY) !== Boolean(process.env.VAPID_PRIVATE_KEY)) {
  errors.push('Both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured together');
}

if (errors.length) {
  console.error('Production preflight failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Production environment preflight passed.');
