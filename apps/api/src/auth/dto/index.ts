// apps/api/src/auth/dto/register.dto.ts
import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@nexus-hub/shared/enums';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.CLIENT })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole = UserRole.CLIENT;
}

// apps/api/src/auth/dto/login.dto.ts
export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  password: string;
}

// apps/api/src/auth/dto/refresh-token.dto.ts
export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

// apps/api/src/auth/dto/logout.dto.ts
export class LogoutDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}
