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
});
