import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  APP_NAME: Joi.string().default('Pharmbrew'),

  PORT: Joi.number().port().default(8000),

  API_PREFIX: Joi.string().default('api/v1'),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),

  DB_NAME: Joi.string().trim().min(1).required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
  CORS_ORIGIN: Joi.string().required(),

  // Google SMTP Settings (Port 465 SSL)
  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().port().default(465),
  SMTP_SECURE: Joi.boolean().default(true),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().default('Pharmbrew <no-reply@pharmbrew.com>'),
});
