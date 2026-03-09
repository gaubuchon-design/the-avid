import { db } from '../db/client';
import { logger } from '../utils/logger';
import { InsufficientTokensError, NotFoundError } from '../utils/errors';

class TokenService {
  /**
   * Get current token balance for a user.
   * Returns 0 if user has no balance record.
   */
  async getBalance(userId: string): Promise<number> {
    const balance = await db.tokenBalance.findUnique({ where: { userId } });
    return balance?.balance ?? 0;
  }

  /**
   * Credit tokens to a user's balance (e.g. purchase, referral, marketplace sale).
   * Creates the balance record if it does not exist.
   */
  async credit(userId: string, amount: number, reason: string, referenceId?: string): Promise<number> {
    if (amount <= 0) {
      throw new Error('Credit amount must be positive');
    }

    const result = await db.tokenBalance.upsert({
      where: { userId },
      update: { balance: { increment: amount }, lifetime: { increment: amount } },
      create: { userId, balance: amount, lifetime: amount },
    });

    await db.tokenTransaction.create({
      data: { balanceId: result.id, delta: amount, reason, referenceId },
    });

    logger.info('Tokens credited', { userId, amount, reason, referenceId, newBalance: result.balance });
    return result.balance;
  }

  /**
   * Debit tokens from a user's balance.
   * Throws InsufficientTokensError if the user does not have enough tokens.
   *
   * NOTE: This uses a check-then-update pattern which is not truly atomic.
   * In production, use a Prisma $transaction with serializable isolation
   * or a raw SQL UPDATE ... WHERE balance >= amount to prevent race conditions.
   */
  async debit(userId: string, amount: number, reason: string, referenceId?: string): Promise<number> {
    if (amount <= 0) {
      throw new Error('Debit amount must be positive');
    }

    const balance = await db.tokenBalance.findUnique({ where: { userId } });
    if (!balance) {
      throw new InsufficientTokensError(amount, 0);
    }
    if (balance.balance < amount) {
      throw new InsufficientTokensError(amount, balance.balance);
    }

    // In production, wrap this in a serializable transaction:
    // await db.$transaction(async (tx) => {
    //   const b = await tx.tokenBalance.findUniqueOrThrow({ where: { userId } });
    //   if (b.balance < amount) throw new InsufficientTokensError(amount, b.balance);
    //   await tx.tokenBalance.update({ where: { userId }, data: { balance: { decrement: amount } } });
    //   await tx.tokenTransaction.create({ data: { balanceId: b.id, delta: -amount, reason, referenceId } });
    // }, { isolationLevel: 'Serializable' });

    const result = await db.tokenBalance.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    });

    await db.tokenTransaction.create({
      data: { balanceId: result.id, delta: -amount, reason, referenceId },
    });

    logger.info('Tokens debited', { userId, amount, reason, referenceId, newBalance: result.balance });
    return result.balance;
  }

  /**
   * Transfer tokens from one user to another.
   */
  async transfer(fromUserId: string, toUserId: string, amount: number, reason: string): Promise<{ fromBalance: number; toBalance: number }> {
    if (amount <= 0) {
      throw new Error('Transfer amount must be positive');
    }

    const fromBalance = await this.debit(fromUserId, amount, `transfer_out:${reason}`, toUserId);
    const toBalance = await this.credit(toUserId, amount, `transfer_in:${reason}`, fromUserId);

    logger.info('Token transfer complete', { fromUserId, toUserId, amount, reason });
    return { fromBalance, toBalance };
  }

  /**
   * Get transaction history for a user, most recent first.
   */
  async getTransactionHistory(userId: string, limit = 50) {
    const tokenBalance = await db.tokenBalance.findUnique({ where: { userId } });
    if (!tokenBalance) return [];

    return db.tokenTransaction.findMany({
      where: { balanceId: tokenBalance.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  /**
   * Get aggregated spending summary for a user over a time period.
   */
  async getSpendingSummary(userId: string, days = 30) {
    const tokenBalance = await db.tokenBalance.findUnique({ where: { userId } });
    if (!tokenBalance) return { totalSpent: 0, totalEarned: 0, transactions: 0 };

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const transactions = await db.tokenTransaction.findMany({
      where: {
        balanceId: tokenBalance.id,
        createdAt: { gte: since },
      },
    });

    const totalSpent = transactions.filter(t => t.delta < 0).reduce((sum, t) => sum + Math.abs(t.delta), 0);
    const totalEarned = transactions.filter(t => t.delta > 0).reduce((sum, t) => sum + t.delta, 0);

    return {
      totalSpent,
      totalEarned,
      netChange: totalEarned - totalSpent,
      transactionCount: transactions.length,
      periodDays: days,
    };
  }
}

export const tokenService = new TokenService();
