// apps/api/src/escrow/dto/release-escrow.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReleaseEscrowDto {
  @ApiPropertyOptional({ description: 'Optional feedback for the freelancer' })
  @IsOptional()
  @IsString()
  feedback?: string;
}
