import { BadRequestException, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Request } from 'express';
import { ClientSession, Connection, Types } from 'mongoose';
import type { CurrentUserPayload } from '../../../../common/decorators/current-user.decorator';

const logger = new Logger('InventoryUtils');

export function ensureValidObjectId(
  id: string,
  label = 'Record',
): Types.ObjectId {
  if (!id || !Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`Invalid ${label} ID format`);
  }
  return new Types.ObjectId(id);
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export function generateReferenceNumber(prefix: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${y}${m}${d}-${rand}`;
}

export function buildAuditContext(
  currentUser: CurrentUserPayload,
  req?: Request,
) {
  return {
    actor: {
      id: currentUser.userId,
      email: currentUser.email,
      role: currentUser.role,
    },
    ipAddress: req?.ip || req?.socket?.remoteAddress,
    userAgent: req?.headers
      ? (req.headers['user-agent'] as string | undefined)
      : undefined,
  };
}

function isStandaloneTransactionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: number })?.code;
  return (
    code === 20 ||
    msg.includes('Transaction numbers are only allowed on a replica set') ||
    msg.includes('does not support transactions') ||
    msg.includes('startTransaction')
  );
}

/**
 * Executes `work` inside a MongoDB ACID transaction when supported (replica set / Atlas).
 * Falls back gracefully to executing without a session when running against standalone MongoDB
 * or mocked test connections, leaving atomic `$inc`/`$gte` guards and compensation in place.
 */
export async function runInTransaction<T>(
  connection: Connection | null | undefined,
  work: (session?: ClientSession) => Promise<T>,
  onFallbackRollback?: (err: unknown) => Promise<void>,
): Promise<T> {
  if (!connection || typeof connection.startSession !== 'function') {
    try {
      return await work(undefined);
    } catch (err) {
      if (onFallbackRollback) {
        await onFallbackRollback(err).catch((rbErr) =>
          logger.error(
            `Fallback rollback error: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`,
          ),
        );
      }
      throw err;
    }
  }

  let session: ClientSession | null = null;
  try {
    session = await connection.startSession();
  } catch {
    session = null;
  }

  if (!session || typeof session.startTransaction !== 'function') {
    try {
      return await work(undefined);
    } finally {
      if (session && typeof session.endSession === 'function') {
        await session.endSession();
      }
    }
  }

  try {
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    try {
      await session.abortTransaction();
    } catch {
      // Ignore abort failures when transaction never started cleanly
    }

    if (isStandaloneTransactionError(err)) {
      logger.warn(
        'MongoDB transactions unavailable (standalone server); retrying operation with atomic conditional guards and compensating recovery',
      );
      try {
        return await work(undefined);
      } catch (fallbackErr) {
        if (onFallbackRollback) {
          await onFallbackRollback(fallbackErr).catch((rbErr) =>
            logger.error(
              `Compensating rollback failed: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`,
            ),
          );
        }
        throw fallbackErr;
      }
    }

    throw err;
  } finally {
    await session.endSession();
  }
}
