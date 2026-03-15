import { createLogger } from '@mcua/editor/lib/logger';

const logger = createLogger('PWA');

/**
 * PWA registration and offline support.
 */
export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        logger.info('Service Worker registered', { scope: registration.scope });

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                logger.info('New content available, refresh to update');
              }
            });
          }
        });
      } catch (err) {
        logger.warn('Service Worker registration failed', { error: String(err) });
      }
    });
  }
}

export function checkOnlineStatus(): boolean {
  return navigator.onLine;
}

export function onOnlineStatusChange(callback: (online: boolean) => void): () => void {
  const onOnline = () => callback(true);
  const onOffline = () => callback(false);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
