export default () => ({
  app: {
    name: process.env.APP_NAME || 'Modus',
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    url: process.env.APP_URL || `http://localhost:${process.env.PORT || '3000'}`,
    apiPrefix: process.env.API_PREFIX || 'api/v1',
  },

  database: {
    uri: process.env.MONGODB_URI,
    name: process.env.MONGODB_DATABASE || process.env.DB_NAME || 'modus',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn:
      process.env.JWT_ACCESS_EXPIRES_IN ||
      process.env.JWT_ACCESS_TTL ||
      '15m',
    refreshExpiresIn:
      process.env.JWT_REFRESH_EXPIRES_IN ||
      process.env.JWT_REFRESH_TTL ||
      '7d',
    accessExpireIn:
      process.env.JWT_ACCESS_EXPIRES_IN ||
      process.env.JWT_ACCESS_TTL ||
      '15m',
    refreshExpireIn:
      process.env.JWT_REFRESH_EXPIRES_IN ||
      process.env.JWT_REFRESH_TTL ||
      '7d',
  },

  cors: {
    origin: process.env.CORS_ORIGIN?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) || ['http://localhost:3001'],
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure:
      process.env.SMTP_SECURE === 'true' ||
      (process.env.SMTP_PORT ? process.env.SMTP_PORT === '465' : true),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Modus <no-reply@modus.local>',
  },
});
