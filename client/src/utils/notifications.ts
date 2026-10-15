/**
 * Progressive Web App (PWA) Centralized Notification Utility
 * Leverages native standard Web Notification API and Service Worker hooks
 * to present haptic device alerts and status tray messages on Android/mobile.
 */

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.warn('System notifications are not supported in this browser environment.');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (err) {
    console.error('Failed to request standard notification permissions:', err);
    return false;
  }
};

interface NotificationOptionsExtended extends NotificationOptions {
  url?: string;
}

export const sendLocalNotification = async (title: string, options: NotificationOptionsExtended = {}) => {
  if (!('Notification' in window)) return;

  const isGranted = Notification.permission === 'granted';
  if (!isGranted) {
    // Attempt lazy request if not explicitly blocked
    if (Notification.permission !== 'denied') {
      const allowed = await requestNotificationPermission();
      if (!allowed) return;
    } else {
      return;
    }
  }

  const defaultOptions: any = {
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [200, 100, 200], // Haptic vibration pattern for Android
    tag: 'tc-lis-alarm',
    renotify: true,
    silent: false,
    data: {
      url: options.url || '/#/dashboard?action=pay-upi'
    },
    ...options
  };

  // Attempt triggering notification through Service Worker (critical for background PWA tasks)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, defaultOptions);
      return;
    } catch (err) {
      console.warn('SW notification fallback: sending via standard background Notification construct.', err);
    }
  }

  // Fallback to standard window Notifications (foreground)
  try {
    const notif = new Notification(title, defaultOptions);
    notif.onclick = () => {
      window.focus();
      if (options.url) {
        window.location.hash = options.url.replace(/^\/?#/, '');
      } else {
        window.location.hash = '/dashboard?action=pay-upi';
      }
      window.dispatchEvent(new CustomEvent('open-upi-payment'));
      notif.close();
    };
  } catch (err) {
    console.error('Failed to trigger background or foreground notification:', err);
  }
};
