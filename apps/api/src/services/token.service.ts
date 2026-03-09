import { db } from '../db/client';
import {
  BadRequestError, InsufficientTokensError, NotFoundError,
} from '../utils/errors';

class TokenService {
  async getBalance(userId: string): Promise<number> {
    const balance = await db.tokenBalance.findUnique({ where: { userId } });
    return balance?.balance ?? 0;
  }

  async credit(userId: string, amount: number, reason: string, referenceId?: string): Promise<number> {
    if (amount <= 0) {
      throw new BadRequestError('Credit amount must be a positive number');
    }
    if (!reason) {
      throw new BadRequestError('A reason is required for token credits');
    }

    return db.$transaction(async (tx: any) => {
      const result = await tx.tokenBalance.upsert({
        where: { userId },
        update: { balance: { increment: amount }, lifetime: { increment: amount } },
        create: { userId, balance: amount, lifetime: amount },
      });
      await tx.tokenTransaction.create({
        data: { balanceId: result.id, delta: amount, reason, referenceId },
      });
      return result.balance;
    });
  }

  async debit(userId: string, amount: number, reason: string, referenceId?: string): Promise<number> {
    if (amount <= 0) {
      throw new BadRequestError('Debit amount must be a positive number');
    }
    if (!reason) {
      throw new BadRequestError('A reason is required for token debits');
    }

    // Use a transaction to ensure atomicity of balance check + decrement
    return db.$transaction(async (tx: any) => {
      const balance = await tx.tokenBalance.findUnique({ where: { userId } });
      const available = balance?.balance ?? 0;
      if (!balance || available < amount) {
        throw new InsufficientTokensError(amount, available);
      }

      const result = await tx.tokenBalance.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });

      await tx.tokenTransaction.create({
        data: { balanceId: result.id, delta: -amount, reason, referenceId },
      });

      return result.balance;
    });
  }

  async getTransactionHistory(userId: string, limit = 50) {
    if (limit < 1 || limit > 500) {
      throw new BadRequestError('Limit must be between 1 and 500');
    }

    const tokenBalance = await db.tokenBalance.findUnique({ where: { userId } });
    if (!tokenBalance) return [];
    return db.tokenTransaction.findMany({
      where: { balanceId: tokenBalance.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const tokenService = new TokenService();
