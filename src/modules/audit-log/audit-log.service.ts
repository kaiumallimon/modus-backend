import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

export interface CreateAuditLogEntry {
  actor: {
    id: string;
    email: string;
    humanId?: string;
    role?: string;
  };
  action: string;
  resource: string;
  resourceId?: string;
  description: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface PaginatedAuditLogsResult {
  data: AuditLogDocument[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  /**
   * Sanitizes metadata to strictly strip sensitive information before persistence.
   */
  private sanitizeMetadata(data?: Record<string, any>): Record<string, any> {
    if (!data || typeof data !== 'object') {
      return {};
    }

    const sensitiveKeys = new Set([
      'password',
      'passwordhash',
      'accesstoken',
      'refreshtoken',
      'token',
      'secret',
      'jwtsecret',
      'hashedrefreshtoken',
      'resetpasswordtokenhash',
    ]);

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (
        sensitiveKeys.has(lowerKey) ||
        lowerKey.includes('password') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret')
      ) {
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  async record(entry: CreateAuditLogEntry): Promise<AuditLogDocument | null> {
    try {
      const sanitizedMeta = this.sanitizeMetadata(entry.metadata);
      const log = new this.auditLogModel({
        actor: entry.actor,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        description: entry.description,
        metadata: sanitizedMeta,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      });
      return await log.save();
    } catch (error) {
      this.logger.error(
        `Failed to persist audit log: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async findAll(query: QueryAuditLogDto): Promise<PaginatedAuditLogsResult> {
    const filter: Record<string, any> = {};

    if (query.action) {
      filter.action = query.action.trim();
    }

    if (query.resource) {
      filter.resource = query.resource.trim();
    }

    if (query.actorId) {
      filter['actor.id'] = query.actorId.trim();
    }

    if (query.search && query.search.trim()) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { 'actor.email': searchRegex },
        { 'actor.humanId': searchRegex },
        { description: searchRegex },
        { action: searchRegex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.auditLogModel.countDocuments(filter).exec(),
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string): Promise<AuditLogDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid audit log ID format');
    }
    const log = await this.auditLogModel.findById(id).exec();
    if (!log) {
      throw new NotFoundException('Audit log entry not found');
    }
    return log;
  }
}
