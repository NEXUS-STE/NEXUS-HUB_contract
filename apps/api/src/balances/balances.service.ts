// apps/api/src/balances/balances.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class BalancesService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: string) {
    const balance = await this.prisma.balance.findUnique({
      where: { userId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!balance) throw new NotFoundException('Balance not found');
    return balance;
  }

  async getTransactionHistory(userId: string, page = 1, limit = 20, type?: string) {
    const where: any = { userId };
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          fee: true,
          currency: true,
          description: true,
          reference: true,
          createdAt: true,
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }
}

// apps/api/src/balances/balances.controller.ts
import { Controller, Get, Query, UseGuards, Version } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BalancesService } from './balances.service';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';

@ApiTags('Balances')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('balances')
@Version('1')
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my current balance' })
  getMyBalance(@CurrentUser('id') userId: string) {
    return this.balancesService.getBalance(userId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  getTransactions(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('type') type?: string,
  ) {
    return this.balancesService.getTransactionHistory(userId, +page, +limit, type);
  }
}
