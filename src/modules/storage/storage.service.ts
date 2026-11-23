import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import 'multer';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const r2Config = this.configService.get('r2') || {};
    const { accountId, accessKeyId, secretAccessKey, bucketName, endpoint, publicBaseUrl } = r2Config;

    this.bucketName = bucketName || process.env.R2_BUCKET_NAME || '';
    this.publicBaseUrl = (publicBaseUrl || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');

    const resolvedEndpoint =
      endpoint ||
      process.env.R2_ENDPOINT ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

    const resolvedAccessKey = accessKeyId || process.env.R2_ACCESS_KEY_ID;
    const resolvedSecretKey = secretAccessKey || process.env.R2_SECRET_ACCESS_KEY;

    if (resolvedAccessKey && resolvedSecretKey && resolvedEndpoint) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: resolvedEndpoint,
        credentials: {
          accessKeyId: resolvedAccessKey,
          secretAccessKey: resolvedSecretKey,
        },
      });
      this.logger.log(`Cloudflare R2 Storage client initialized for bucket "${this.bucketName}"`);
    } else {
      this.logger.warn('Cloudflare R2 credentials not fully configured; storage operations will fail until configured');
    }
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ url: string; key: string }> {
    if (!file) {
      throw new BadRequestException('No image file provided for upload');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid image format "${file.mimetype}". Only JPEG, PNG, WEBP, and GIF files are allowed`,
      );
    }

    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSizeBytes) {
      throw new BadRequestException('Avatar image file size exceeds the 5MB limit');
    }

    if (!this.s3Client || !this.bucketName) {
      throw new InternalServerErrorException(
        'Cloudflare R2 storage is not properly configured on this server',
      );
    }

    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const ext = extMap[file.mimetype] || 'png';
    const key = `avatars/${userId}-${Date.now()}.${ext}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      const publicUrl = this.publicBaseUrl
        ? `${this.publicBaseUrl}/${key}`
        : `${this.configService.get('r2.endpoint')}/${this.bucketName}/${key}`;

      this.logger.log(`Uploaded avatar for user ${userId} to R2 key ${key}`);
      return { url: publicUrl, key };
    } catch (error: any) {
      this.logger.error(`Failed to upload avatar to R2: ${error?.message || error}`, error?.stack);
      throw new InternalServerErrorException('Failed to upload avatar to Cloudflare storage');
    }
  }

  async deleteAvatar(keyOrUrl: string): Promise<void> {
    if (!keyOrUrl || !this.s3Client || !this.bucketName) return;

    let key = keyOrUrl;
    if (keyOrUrl.startsWith('http')) {
      const parts = keyOrUrl.split('/');
      key = parts.slice(parts.indexOf('avatars')).join('/');
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      this.logger.log(`Deleted avatar key "${key}" from R2`);
    } catch (error: any) {
      this.logger.warn(`Failed to delete previous avatar from R2: ${error?.message || error}`);
    }
  }
}
