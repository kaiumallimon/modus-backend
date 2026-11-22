export default () => ({
  app: {
    name: process.env.APP_NAME || 'Pharmbrew',
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '8000', 10),
    apiPrefix: process.env.API_PREFIX || 'api/v1',
  },

  database: {
    uri: process.env.MONGODB_URI,
    name: process.env.DB_NAME,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_TTL || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_TTL || '7d',
    accessExpireIn: process.env.JWT_ACCESS_TTL || '15m',
    refreshExpireIn: process.env.JWT_REFRESH_TTL || '7d',
  },

  cors: {
    origin: process.env.CORS_ORIGIN?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
});
