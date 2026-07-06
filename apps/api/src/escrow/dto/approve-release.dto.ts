// apps/api/src/escrow/dto/approve-release.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApproveReleaseDto {
  @ApiPropertyOptional({ description: 'Optional note recorded in the audit log' })
  @IsOptional()
  @IsString()
  note?: string;
}
