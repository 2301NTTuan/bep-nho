process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT_LOGIN_POINTS ??= '10000';
process.env.AUTH_RATE_LIMIT_REGISTER_POINTS ??= '10000';
process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS ??= '60';
process.env.AUTH_RATE_LIMIT_KEY_PREFIX ??= 'bep-nho:test';
