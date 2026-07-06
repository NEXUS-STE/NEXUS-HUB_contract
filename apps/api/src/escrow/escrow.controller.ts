// apps/api/src/escrow/escrow.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { EscrowService } from './escrow.service';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { ReleaseEscrowDto } from './dto/release-escrow.dto';
import { RefundEscrowDto } from './dto/refund-escrow.dto';
import { ApproveReleaseDto } from './dto/approve-release.dto';
import { JwtAuthGuard } from '../common/guards';
import { RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';
import { Roles } from '../common/decorators';
import { IdempotencyKey } from '../common/decorators';
import { UserRole } from '@nexus-hub/shared/enums';

@ApiTags('Escrow')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('escrow')
@Version('1')
export class EscrowController {
  constructor(private readonly escrowService: EscrowService) {}

  // ─── Create ──────────────────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.CLIENT)
  @ApiOperation({ summary: 'Create and fund a new escrow (client only)' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateEscrowDto,
    @IdempotencyKey() key: string,
  ) {
    return this.escrowService.createEscrow(userId, dto, key);
  }

  // ─── List ────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List escrows for the authenticated user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.escrowService.listEscrows(userId, role, page, limit);
  }

  // ─── Get by ID ────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get escrow details' })
  @ApiParam({ name: 'id', type: String })
  getOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) escrowId: string,
  ) {
    return this.escrowService.getEscrow(userId, escrowId);
  }

  // ─── Milestones ───────────────────────────────────────────────────────────

  @Get(':id/milestones')
  @ApiOperation({ summary: 'Get milestone progress for an escrow' })
  @ApiParam({ name: 'id', type: String })
  getMilestones(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) escrowId: string,
  ) {
    return this.escrowService.getMilestones(userId, escrowId);
  }

  // ─── Release ─────────────────────────────────────────────────────────────

  @Post(':id/release')
  @Roles(UserRole.CLIENT)
  @ApiOperation({ summary: 'Release escrow funds to the freelancer (client only)' })
  @ApiParam({ name: 'id', type: String })
  release(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) escrowId: string,
    @Body() dto: ReleaseEscrowDto,
  ) {
    return this.escrowService.releaseEscrow(userId, escrowId, dto);
  }

  // ─── Approve release (2-of-2) ────────────────────────────────────────────

  @Post(':id/approve-release')
  @ApiOperation({ summary: 'Approve 2-of-2 release (client or freelancer)' })
  @ApiParam({ name: 'id', type: String })
  approveRelease(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id', ParseUUIDPipe) escrowId: string,
    @Body() _dto: ApproveReleaseDto,
  ) {
    const party = role === 'CLIENT' ? 'CLIENT' : 'FREELANCER';
    return this.escrowService.approveRelease(userId, escrowId, party);
  }

  // ─── Complete milestone ───────────────────────────────────────────────────

  @Post(':id/complete-milestone')
  @Roles(UserRole.FREELANCER)
  @ApiOperation({ summary: 'Mark the next milestone complete (freelancer only)' })
  @ApiParam({ name: 'id', type: String })
  completeMilestone(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) escrowId: string,
  ) {
    return this.escrowService.completeMilestone(userId, escrowId);
  }

  // ─── Claim expired ────────────────────────────────────────────────────────

  @Post(':id/claim-expired')
  @ApiOperation({ summary: 'Reclaim funds from an expired escrow (permissionless)' })
  @ApiParam({ name: 'id', type: String })
  claimExpired(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) escrowId: string,
  ) {
    return this.escrowService.claimExpired(userId, escrowId);
  }

  // ─── Admin: refund ────────────────────────────────────────────────────────

  @Post(':id/refund')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: force-refund an escrow back to the client' })
  @ApiParam({ name: 'id', type: String })
  refund(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) escrowId: string,
    @Body() dto: RefundEscrowDto,
  ) {
    return this.escrowService.refundEscrow(adminId, escrowId, dto);
  }

  // ─── Admin: transfer contract admin ────────────────────────────────────────

  @Post(':id/transfer-admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: rotate the on-chain NexusEscrow admin keypair' })
  @ApiParam({ name: 'id', type: String })
  transferAdmin(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) escrowId: string,
  ) {
    return this.escrowService.transferAdmin(adminId, escrowId);
  }
}
