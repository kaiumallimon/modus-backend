import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SeedSuperAdminDto } from './dto/seed-super-admin.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

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
  @ApiOperation({ summary: 'User login returning access and refresh tokens' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current user and invalidate refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  logout(@CurrentUser('userId') userId: string) {
    return this.authService.logout(userId);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMe(@CurrentUser('userId') userId: string) {
    return this.authService.getProfile(userId);
  }
}
