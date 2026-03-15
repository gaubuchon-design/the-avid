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

function getRuntimeImportMetaEnv(): RuntimeImportMetaEnv | undefined {
  return (
    import.meta as ImportMeta & {
      env?: RuntimeImportMetaEnv;
    }
  ).env;
}

function getRuntimeProcessEnv(): RuntimeProcessLike['env'] | undefined {
  return (globalThis as { process?: RuntimeProcessLike }).process?.env;
}

export function isDevelopmentEnvironment(): boolean {
  const viteDevFlag = getRuntimeImportMetaEnv()?.DEV;

  if (typeof viteDevFlag === 'boolean') {
    return viteDevFlag;
  }

  const nodeEnv = getRuntimeProcessEnv()?.NODE_ENV;
  return typeof nodeEnv === 'string' ? nodeEnv !== 'production' : false;
}

export function isTestEnvironment(): boolean {
  return getRuntimeProcessEnv()?.NODE_ENV === 'test';
}

export function isStoreDevtoolsEnabled(): boolean {
  return isDevelopmentEnvironment() && !isTestEnvironment();
}

export function getStoreDevtoolsOptions(name: string): { name: string; enabled: boolean } {
  return {
    name,
    enabled: isStoreDevtoolsEnabled(),
  };
}

export function resolveApiBaseUrl(): string {
  const importMetaEnv = getRuntimeImportMetaEnv();
  const processEnv = getRuntimeProcessEnv();

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
