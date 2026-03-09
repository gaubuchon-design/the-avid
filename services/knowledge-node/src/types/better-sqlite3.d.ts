declare module 'better-sqlite3' {
  namespace Database {
    interface Database {
      prepare(sql: string): Statement;
      exec(sql: string): this;
      transaction<F extends (...args: any[]) => any>(fn: F): Transaction<F>;
      pragma(pragma: string, options?: { simple?: boolean }): unknown;
      close(): void;
      readonly open: boolean;
      readonly inTransaction: boolean;
      readonly name: string;
      readonly memory: boolean;
      readonly readonly: boolean;
    }

    interface Statement {
      run(...params: any[]): RunResult;
      get(...params: any[]): any;
      all(...params: any[]): any[];
      iterate(...params: any[]): IterableIterator<any>;
      bind(...params: any[]): this;
    }

    interface RunResult {
      changes: number;
      lastInsertRowid: number | bigint;
    }

    interface Transaction<F extends (...args: any[]) => any> {
      (...args: Parameters<F>): ReturnType<F>;
      deferred(...args: Parameters<F>): ReturnType<F>;
      immediate(...args: Parameters<F>): ReturnType<F>;
      exclusive(...args: Parameters<F>): ReturnType<F>;
    }
  }

  interface DatabaseConstructor {
    new (filename: string | Buffer, options?: {
      readonly?: boolean;
      fileMustExist?: boolean;
      timeout?: number;
      verbose?: (...args: any[]) => void;
    }): Database.Database;
    (filename: string | Buffer, options?: {
      readonly?: boolean;
      fileMustExist?: boolean;
      timeout?: number;
      verbose?: (...args: any[]) => void;
    }): Database.Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}
