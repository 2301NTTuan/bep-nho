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
  AUTH_RATE_LIMIT_WINDOW_SECONDS: Joi.number().integer().min(1).default(60),
  AUTH_RATE_LIMIT_KEY_PREFIX: Joi.string().pattern(/^[A-Za-z0-9:._-]{1,64}$/).default('bep-nho:auth'),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(10).default(0),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  OPENAPI_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  METRICS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
});
