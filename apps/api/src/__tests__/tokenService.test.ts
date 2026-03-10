import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, InsufficientTokensError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Mock the db client
// ---------------------------------------------------------------------------

const mockTransaction = vi.fn();
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();

vi.mock('../db/client', () => ({
  db: {
    tokenBalance: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    tokenTransaction: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mockTransaction(fn),
  },
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config
vi.mock('../config', () => ({
  config: {
    isDev: false,
    isProd: false,
    logging: { level: 'info', file: 'logs/api.log' },
    db: { url: 'mock' },
  },
}));

// Import after mocks
import { tokenService } from '../services/token.service';

describe('TokenService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // getBalance
  // -----------------------------------------------------------------------

  describe('getBalance', () => {
    it('returns balance when record exists', async () => {
      mockFindUnique.mockResolvedValue({ balance: 500 });

      const balance = await tokenService.getBalance('user-1');
      expect(balance).toBe(500);
    });

    it('returns 0 when no balance record exists', async () => {
      mockFindUnique.mockResolvedValue(null);

      const balance = await tokenService.getBalance('user-2');
      expect(balance).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // credit
  // -----------------------------------------------------------------------

  describe('credit', () => {
    it('throws BadRequestError for non-positive amount', async () => {
      await expect(tokenService.credit('u1', 0, 'test')).rejects.toThrow(
        BadRequestError,
      );
      await expect(tokenService.credit('u1', -5, 'test')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws BadRequestError when reason is empty', async () => {
      await expect(tokenService.credit('u1', 100, '')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('executes credit in a transaction', async () => {
      const mockTx = {
        tokenBalance: {
          upsert: vi.fn().mockResolvedValue({ id: 'tb-1', balance: 600 }),
        },
        tokenTransaction: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );

      const result = await tokenService.credit('u1', 100, 'bonus', 'ref-1');
      expect(result).toBe(600);
      expect(mockTx.tokenBalance.upsert).toHaveBeenCalled();
      expect(mockTx.tokenTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            delta: 100,
            reason: 'bonus',
            referenceId: 'ref-1',
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // debit
  // -----------------------------------------------------------------------

  describe('debit', () => {
    it('throws BadRequestError for non-positive amount', async () => {
      await expect(tokenService.debit('u1', 0, 'test')).rejects.toThrow(
        BadRequestError,
      );
      await expect(tokenService.debit('u1', -1, 'test')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws BadRequestError when reason is empty', async () => {
      await expect(tokenService.debit('u1', 10, '')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws InsufficientTokensError when balance is too low', async () => {
      const mockTx = {
        tokenBalance: {
          findUnique: vi.fn().mockResolvedValue({ balance: 50 }),
        },
      };

      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );

      await expect(
        tokenService.debit('u1', 100, 'job'),
      ).rejects.toThrow(InsufficientTokensError);
    });

    it('throws InsufficientTokensError when no balance record exists', async () => {
      const mockTx = {
        tokenBalance: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );

      await expect(
        tokenService.debit('u1', 100, 'job'),
      ).rejects.toThrow(InsufficientTokensError);
    });

    it('executes debit in a transaction when balance is sufficient', async () => {
      const mockTx = {
        tokenBalance: {
          findUnique: vi.fn().mockResolvedValue({ balance: 500 }),
          update: vi.fn().mockResolvedValue({ id: 'tb-1', balance: 400 }),
        },
        tokenTransaction: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );

      const result = await tokenService.debit('u1', 100, 'ai-job', 'ref-2');
      expect(result).toBe(400);
      expect(mockTx.tokenTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            delta: -100,
            reason: 'ai-job',
            referenceId: 'ref-2',
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // getTransactionHistory
  // -----------------------------------------------------------------------

  describe('getTransactionHistory', () => {
    it('throws BadRequestError for limit < 1', async () => {
      await expect(
        tokenService.getTransactionHistory('u1', 0),
      ).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError for limit > 500', async () => {
      await expect(
        tokenService.getTransactionHistory('u1', 501),
      ).rejects.toThrow(BadRequestError);
    });

    it('returns empty array when no balance record exists', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await tokenService.getTransactionHistory('u1');
      expect(result).toEqual([]);
    });

    it('returns transactions when balance exists', async () => {
      mockFindUnique.mockResolvedValue({ id: 'tb-1' });
      mockFindMany.mockResolvedValue([
        { id: 'tx-1', delta: 100 },
        { id: 'tx-2', delta: -50 },
      ]);

      const result = await tokenService.getTransactionHistory('u1', 10);
      expect(result).toHaveLength(2);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { balanceId: 'tb-1' },
          take: 10,
        }),
      );
    });
  });
});
