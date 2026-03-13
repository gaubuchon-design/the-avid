type RuntimeProcessLike = {
  env?: {
    NODE_ENV?: string;
  };
};

export function isDevelopmentEnvironment(): boolean {
  const viteDevFlag = (import.meta as ImportMeta & {
    env?: {
      DEV?: boolean;
    };
  }).env?.DEV;

  if (typeof viteDevFlag === 'boolean') {
    return viteDevFlag;
  }

  const nodeEnv = (globalThis as { process?: RuntimeProcessLike }).process?.env?.NODE_ENV;
  return typeof nodeEnv === 'string' ? nodeEnv !== 'production' : false;
}
