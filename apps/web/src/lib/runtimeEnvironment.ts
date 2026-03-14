type RuntimeProcessLike = {
  env?: {
    NODE_ENV?: string;
    VITE_API_BASE_URL?: string;
    VITE_API_URL?: string;
  };
};

type RuntimeImportMetaEnv = {
  DEV?: boolean;
  VITE_API_BASE_URL?: string;
  VITE_API_URL?: string;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isDevelopmentEnvironment(): boolean {
  const viteDevFlag = (
    import.meta as ImportMeta & {
      env?: RuntimeImportMetaEnv;
    }
  ).env?.DEV;

  if (typeof viteDevFlag === 'boolean') {
    return viteDevFlag;
  }

  const nodeEnv = (globalThis as { process?: RuntimeProcessLike }).process?.env?.NODE_ENV;
  return typeof nodeEnv === 'string' ? nodeEnv !== 'production' : false;
}

export function resolveApiBaseUrl(): string {
  const importMetaEnv = (
    import.meta as ImportMeta & {
      env?: RuntimeImportMetaEnv;
    }
  ).env;
  const processEnv = (globalThis as { process?: RuntimeProcessLike }).process?.env;

  const configuredBase =
    importMetaEnv?.VITE_API_BASE_URL ??
    importMetaEnv?.VITE_API_URL ??
    processEnv?.VITE_API_BASE_URL ??
    processEnv?.VITE_API_URL;
  if (typeof configuredBase === 'string' && configuredBase.trim().length > 0) {
    return trimTrailingSlash(configuredBase.trim());
  }

  return '/api';
}

export function resolveApiUrl(pathname: string): string {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${resolveApiBaseUrl()}${normalizedPathname}`;
}
