// apps/api/src/escrow/dto/refund-escrow.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefundEscrowDto {
  @ApiProperty({ description: 'Reason for the admin-initiated refund' })
  @IsString()
  @MinLength(10)
  reason!: string;
}
