import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import 'multer';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SeedSuperAdminDto } from './dto/seed-super-admin.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('seed-super-admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Seed initial Super Admin (allowed only if no Super Admin exists)',
  })
  @ApiResponse({ status: 201, description: 'Super Admin successfully created' })
  @ApiResponse({ status: 403, description: 'Super Admin already exists' })
  seedSuperAdmin(@Body() dto: SeedSuperAdminDto) {
    return this.authService.seedSuperAdmin(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User login with email or Human ID returning JWT pair',
    description:
      'Allows authentication using either the registered email address or human-readable User ID (e.g. MOD-10492).',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid email/ID or password' })
  login(@Body() dto: LoginDto, @Req() req?: Request) {
    const ipAddress = req?.ip || req?.socket?.remoteAddress;
    const userAgent = req?.headers ? req.headers['user-agent'] : undefined;
    return this.authService.login(dto, ipAddress, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate and refresh JWT access and refresh token pair',
  })
  @ApiResponse({ status: 200, description: 'Token successfully rotated' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset token via registered email',
    description:
      'Universal forgot password endpoint for all roles. Accepts registered email or human-readable ID and dispatches a single-use 15-minute token via SMTP.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset email initiated (generic response)',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using single-use email token',
    description:
      'Validates the single-use token and expiration, updates the user password, and revokes all active refresh tokens.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password successfully reset',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired password reset token',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current user and invalidate refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  logout(@CurrentUser('userId') userId: string, @Req() req?: Request) {
    const ipAddress = req?.ip || req?.socket?.remoteAddress;
    const userAgent = req?.headers ? req.headers['user-agent'] : undefined;
    return this.authService.logout(userId, ipAddress, userAgent);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change authenticated user password and invalidate active refresh tokens',
    description:
      'Requires valid current password and securely updates to new Argon2 hashed password, revoking any active refresh token sessions.',
  })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid current password' })
  changePassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req?: Request,
  ) {
    const ipAddress = req?.ip || req?.socket?.remoteAddress;
    const userAgent = req?.headers ? req.headers['user-agent'] : undefined;
    return this.authService.changePassword(userId, dto, ipAddress, userAgent);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMe(@CurrentUser('userId') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Post('me/avatar')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload avatar for current authenticated user',
    description:
      'Uploads an image file to Cloudflare CDN and assigns it to the current user profile. Only the logged-in user can modify their own avatar.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Avatar uploaded successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid image file or size exceeds 5MB',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  uploadAvatar(
    @CurrentUser('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req?: Request,
  ) {
    const ipAddress = req?.ip || req?.socket?.remoteAddress;
    const userAgent = req?.headers ? req.headers['user-agent'] : undefined;
    return this.authService.uploadAvatar(userId, file, ipAddress, userAgent);
  }

  @Delete('me/avatar')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove avatar for current authenticated user',
    description:
      'Deletes the current user avatar from Cloudflare CDN and resets the profile avatar URL.',
  })
  @ApiResponse({ status: 200, description: 'Avatar removed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  removeAvatar(
    @CurrentUser('userId') userId: string,
    @Req() req?: Request,
  ) {
    const ipAddress = req?.ip || req?.socket?.remoteAddress;
    const userAgent = req?.headers ? req.headers['user-agent'] : undefined;
    return this.authService.removeAvatar(userId, ipAddress, userAgent);
  }
}
