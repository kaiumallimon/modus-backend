import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  APP_NAME: Joi.string().default('Modus'),
  APP_URL: Joi.string().uri().optional(),

  PORT: Joi.number().port().default(3000),

  API_PREFIX: Joi.string().default('api/v1'),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),

  MONGODB_DATABASE: Joi.string().trim().min(1).default('modus'),
  DB_NAME: Joi.string().trim().min(1).optional(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  JWT_ACCESS_TTL: Joi.string().optional(),
  JWT_REFRESH_TTL: Joi.string().optional(),

  CORS_ORIGIN: Joi.string().required(),

  // Google SMTP Settings (Port 465 SSL)
  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().port().default(465),
  SMTP_SECURE: Joi.boolean().default(true),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().default('Modus <no-reply@modus.local>'),
});
