self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const relativeUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/#/dashboard?action=pay-due';
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin)) {
          try {
            if ('postMessage' in client) {
              client.postMessage({ type: 'OPEN_PAYMENT_DUE' });
            }
          } catch (e) {
            console.error('Failed to post message to window client:', e);
          }
          try {
            if ('navigate' in client) {
              await client.navigate(targetUrl);
            }
          } catch (e) {
            console.error('Failed to navigate client:', e);
          }
          if ('focus' in client) {
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
