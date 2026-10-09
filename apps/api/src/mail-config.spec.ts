import { envValidationSchema } from './config/env.validation';

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/database',
  REDIS_URL: 'redis://127.0.0.1:6379',
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_ACCESS_KEY: 'test-access-key',
  S3_SECRET_KEY: 'test-secret-key',
  S3_BUCKET: 'test-bucket',
};

function validate(overrides: Record<string, unknown>) {
  return envValidationSchema.validate({ ...requiredEnvironment, ...overrides }, { abortEarly: false });
}

describe('lifecycle mail environment validation', () => {
  it('rejects production with the memory transport', () => {
    expect(validate({ NODE_ENV: 'production', MAIL_TRANSPORT: 'memory' }).error).toBeDefined();
  });

  it('rejects production SMTP without a host', () => {
    expect(validate({
      NODE_ENV: 'production', MAIL_TRANSPORT: 'smtp', MAIL_FROM: 'sender@example.com',
    }).error).toBeDefined();
  });

  it('rejects production SMTP without a sender', () => {
    expect(validate({
      NODE_ENV: 'production', MAIL_TRANSPORT: 'smtp', MAIL_SMTP_HOST: 'smtp.example.com',
    }).error).toBeDefined();
  });

  it('rejects an SMTP username without a password', () => {
    expect(validate({
      NODE_ENV: 'production', MAIL_TRANSPORT: 'smtp', MAIL_SMTP_HOST: 'smtp.example.com',
      MAIL_FROM: 'sender@example.com', MAIL_SMTP_USERNAME: 'mailer',
    }).error).toBeDefined();
  });

  it('rejects an SMTP password without a username', () => {
    expect(validate({
      NODE_ENV: 'production', MAIL_TRANSPORT: 'smtp', MAIL_SMTP_HOST: 'smtp.example.com',
      MAIL_FROM: 'sender@example.com', MAIL_SMTP_PASSWORD: 'not-a-real-secret',
    }).error).toBeDefined();
  });

  it('accepts a valid production SMTP configuration', () => {
    expect(validate({
      NODE_ENV: 'production', MAIL_TRANSPORT: 'smtp', MAIL_SMTP_HOST: 'smtp.example.com',
      MAIL_SMTP_PORT: 587, MAIL_FROM: 'sender@example.com',
      MAIL_SMTP_USERNAME: 'mailer', MAIL_SMTP_PASSWORD: 'not-a-real-secret',
    }).error).toBeUndefined();
  });

  it('accepts the memory transport in development and test', () => {
    expect(validate({ NODE_ENV: 'development', MAIL_TRANSPORT: 'memory' }).error).toBeUndefined();
    expect(validate({ NODE_ENV: 'test', MAIL_TRANSPORT: 'memory' }).error).toBeUndefined();
  });
});
