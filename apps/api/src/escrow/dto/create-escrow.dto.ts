// apps/api/src/escrow/dto/create-escrow.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  Min,
  Max,
  IsInt,
} from 'class-validator';

export class CreateEscrowDto {
  @ApiProperty({ description: 'Freelancer user ID (UUID)' })
  @IsUUID()
  freelancerId!: string;

  @ApiProperty({ description: 'Amount in USD (e.g. 500.00)' })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ description: 'Brief description of the work' })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ description: 'Milestone title for single-milestone escrows' })
  @IsOptional()
  @IsString()
  milestoneTitle?: string;

  @ApiPropertyOptional({ description: 'SHA-256 hex of the deliverable spec (committed on-chain)' })
  @IsOptional()
  @IsString()
  milestoneHash?: string;

  @ApiPropertyOptional({ description: 'Number of milestones to track (0 = no tracking)', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  milestonesTotal?: number;

  @ApiPropertyOptional({ description: 'Absolute Stellar ledger number after which the escrow can be claimed as expired (0 = no expiry)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  expiryLedger?: number;
}
