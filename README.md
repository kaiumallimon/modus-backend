# Modus — Self-hosted Business Management System

Modus is a self-hosted, single-organization, modular business management platform built with NestJS, TypeScript, MongoDB, and Mongoose.

## Architecture

Modus follows a **Modular Monolith** architecture:
- Single-organization workspace (no multi-tenancy overhead).
- Platform-wide Role-Based Access Control (RBAC).
- Extensible installation-level module registry.
- High-performance asynchronous structured logging via `nestjs-pino`.
- Production-grade security: Argon2 password hashing, rotating JWT refresh tokens, Helmet, CORS, and strict class-validator DTO validation.

## Prerequisites

- Node.js (v20+ or v24+)
- MongoDB (v6.0+)

## Environment Configuration

Copy the example environment configuration:

```bash
cp .env.example .env
```

Ensure MongoDB is configured:
```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=modus
```

## Setup & Running

```bash
# Install dependencies
$ npm install

# Run in development mode with watch
$ npm run start:dev

# Build for production
$ npm run build

# Run production build
$ npm run start:prod
```

## API Documentation

Interactive Swagger documentation is available once the server is running:
- **URL**: `http://localhost:8000/api/v1/docs`

## Running Tests

```bash
# Run unit tests
$ npm run test

# Run linter
$ npm run lint
```

## License

UNLICENSED
