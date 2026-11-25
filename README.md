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

## API Documentation & Endpoints

Interactive Swagger documentation is available once the server is running:
- **Swagger Documentation**: `http://localhost:8000/api/docs`

### Core Infrastructure & API Endpoints

Interactive Swagger documentation is available once the server is running at `http://localhost:8000/api/docs`.

#### 1. Installation Setup & Lifecycle
- `GET /api/v1/installation/status`: Check whether installation requires initial setup (`{ initialized, setupRequired, version }`).
- `POST /api/v1/installation/setup`: Atomically bootstrap initial Super Admin, system settings, default roles/permissions, and core modules.

#### 2. Authentication
- `POST /api/v1/auth/login`: Authenticate via email or human-readable ID (`MOD-xxxxx`).
- `POST /api/v1/auth/refresh`: Rotate and refresh JWT access and refresh token pair.
- `POST /api/v1/auth/logout`: Revoke active refresh session.
- `POST /api/v1/auth/change-password`: Change authenticated user password (invalidates existing refresh tokens).
- `POST /api/v1/auth/forgot-password`: Request single-use password reset token via email.
- `POST /api/v1/auth/reset-password`: Reset password using single-use email token.
- `GET /api/v1/auth/me`: Current authenticated user profile.

#### 3. User Management
- `GET /api/v1/users`: Paginated user list with role and status filtering.
- `GET /api/v1/users/:id`: Single user details.
- `POST /api/v1/users`: Create user with transactional email verification & temporary credentials.
- `PATCH /api/v1/users/:id`: Update user profile details.
- `PATCH /api/v1/users/:id/status`: Activate or deactivate account (last active Super Admin is protected).

#### 4. Access Control (RBAC)
- `GET /api/v1/roles`: List all system and custom roles with permissions.
- `GET /api/v1/roles/:id`: View role details.
- `POST /api/v1/roles`: Create custom role.
- `PATCH /api/v1/roles/:id`: Update role permissions.
- `DELETE /api/v1/roles/:id`: Delete custom role (system roles protected).
- `GET /api/v1/permissions`: Master permission registry (core and module permissions).

#### 5. System Settings
- `GET /api/v1/settings`: View application-level preferences and pagination defaults.
- `PATCH /api/v1/settings`: Update application-level preferences (secrets strictly prevented).

#### 6. Module Registry
- `GET /api/v1/modules`: List all registered modules and activation state.
- `GET /api/v1/modules/:id`: View module metadata and dependencies.
- `PATCH /api/v1/modules/:id/activation`: Activate or deactivate a module (dependency checking & core module protection).

#### 7. Audit Logging
- `GET /api/v1/audit-logs`: Paginated immutable historical audit log.
- `GET /api/v1/audit-logs/:id`: Single audit log details.

#### 8. Health & Readiness
- `GET /api/v1/health`: Process liveness check (`{ status: 'ok', application: 'Modus' }`).
- `GET /api/v1/health/ready`: Database dependency readiness check (MongoDB connectivity).

## Running Tests

```bash
# Run unit tests
$ npm run test

# Run linter
$ npm run lint
```

## License

UNLICENSED
