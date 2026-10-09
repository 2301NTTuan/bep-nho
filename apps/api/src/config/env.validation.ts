import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number()
    .port()
    .default(3001),

  DATABASE_URL: Joi.string()
    .required(),

  REDIS_URL: Joi.string()
    .required(),

  S3_ENDPOINT: Joi.string()
    .uri()
    .required(),

  S3_ACCESS_KEY: Joi.string()
    .required(),

  S3_SECRET_KEY: Joi.string()
    .required(),

  S3_BUCKET: Joi.string()
    .required(),

  CORS_ORIGIN: Joi.string()
    .default('http://localhost:3000,http://localhost:3002'),

  AUTH_RATE_LIMIT_LOGIN_POINTS: Joi.number().integer().min(1).default(10),
  AUTH_RATE_LIMIT_REGISTER_POINTS: Joi.number().integer().min(1).default(5),
  AUTH_RATE_LIMIT_LIFECYCLE_REQUEST_POINTS: Joi.number().integer().min(1).default(5),
  AUTH_RATE_LIMIT_LIFECYCLE_CONFIRM_POINTS: Joi.number().integer().min(1).default(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: Joi.number().integer().min(1).default(60),
  AUTH_RATE_LIMIT_KEY_PREFIX: Joi.string().pattern(/^[A-Za-z0-9:._-]{1,64}$/).default('bep-nho:auth'),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(10).default(0),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  OPENAPI_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  METRICS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  PUBLIC_WEB_URL: Joi.string().uri().default('http://localhost:3000'),
  MAIL_TRANSPORT: Joi.string().valid('memory', 'smtp').default('memory'),
  MAIL_FROM: Joi.string().email().allow('').default(''),
  MAIL_SMTP_HOST: Joi.string().hostname().allow('').default(''),
  MAIL_SMTP_PORT: Joi.number().port().default(587),
  MAIL_SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  MAIL_SMTP_USERNAME: Joi.string().allow('').default(''),
  MAIL_SMTP_PASSWORD: Joi.string().allow('').default(''),
  DEV_MAIL_OUTBOX_KEY: Joi.string().min(16).max(128).allow('').default(''),
}).custom((environment, helpers) => {
  const production = environment.NODE_ENV === 'production';
  const smtp = environment.MAIL_TRANSPORT === 'smtp';
  if (production && !smtp) {
    return helpers.message({ custom: 'Production lifecycle mail requires the SMTP transport.' });
  }
  if (smtp && !environment.MAIL_SMTP_HOST) {
    return helpers.message({ custom: 'SMTP host is required when the SMTP transport is selected.' });
  }
  if (smtp && !environment.MAIL_FROM) {
    return helpers.message({ custom: 'SMTP sender is required when the SMTP transport is selected.' });
  }
  const hasUsername = Boolean(environment.MAIL_SMTP_USERNAME);
  const hasPassword = Boolean(environment.MAIL_SMTP_PASSWORD);
  if (smtp && hasUsername !== hasPassword) {
    return helpers.message({ custom: 'SMTP username and password must be configured together.' });
  }
  return environment;
});
