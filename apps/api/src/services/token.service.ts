import { db } from '../db/client';
import { NotFoundError } from '../utils/errors';

class TokenService {
  async getBalance(userId: string): Promise<number> {
    const balance = await db.tokenBalance.findUnique({ where: { userId } });
    return balance?.balance ?? 0;
  }

  async credit(userId: string, amount: number, reason: string, referenceId?: string): Promise<number> {
    const result = await db.tokenBalance.upsert({
      where: { userId },
      update: { balance: { increment: amount }, lifetime: { increment: amount } },
      create: { userId, balance: amount, lifetime: amount },
    });
    await db.tokenTransaction.create({
      data: { balanceId: result.id, delta: amount, reason, referenceId },
    });
    return result.balance;
  }

  async debit(userId: string, amount: number, reason: string, referenceId?: string): Promise<number> {
    // Atomic decrement with floor at 0 check
    const balance = await db.tokenBalance.findUnique({ where: { userId } });
    if (!balance || balance.balance < amount) {
      throw new Error('Insufficient token balance');
    }

    const result = await db.tokenBalance.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    });

    await db.tokenTransaction.create({
      data: { balanceId: result.id, delta: -amount, reason, referenceId },
    });

    return result.balance;
  }

  async getTransactionHistory(userId: string, limit = 50) {
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
