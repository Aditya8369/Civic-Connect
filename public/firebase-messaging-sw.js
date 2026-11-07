/* eslint-disable no-undef */
// Service worker for Firebase Cloud Messaging background notifications
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

const urlParams = new URLSearchParams(self.location.search)
const firebaseConfig = {
  apiKey: urlParams.get('apiKey') || '',
  authDomain: urlParams.get('authDomain') || '',
  projectId: urlParams.get('projectId') || '',
  storageBucket: urlParams.get('storageBucket') || '',
  messagingSenderId: urlParams.get('messagingSenderId') || '',
  appId: urlParams.get('appId') || '',
}

if (!firebase.apps.length && firebaseConfig.messagingSenderId) {
  firebase.initializeApp(firebaseConfig)
}

let messaging = null
try {
  if (firebase.apps.length > 0) {
    messaging = firebase.messaging()
  }
} catch (err) {
  // Graceful fallback if messaging is not supported in the active browser context
  console.warn('Firebase Messaging SW init warning:', err)
}

if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Civic-Connect Update'
    const message = payload.notification?.body || payload.data?.message || 'Your complaint status has been updated.'
    const issueId = payload.data?.issueId || payload.data?.complaintId || ''
    const targetUrl = payload.data?.url || (issueId ? `/complaints/${issueId}` : '/notifications')

    const options = {
      body: message,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: {
        url: targetUrl,
        issueId,
      },
    }

    return self.registration.showNotification(title, options)
  })
} else {
  // Fallback push listener if messaging compat fails to initialize
  self.addEventListener('push', (event) => {
    if (!event.data) return
    try {
      const payload = event.data.json()
      const title = payload.notification?.title || payload.data?.title || 'Civic-Connect Update'
      const message = payload.notification?.body || payload.data?.message || 'Your complaint status has been updated.'
      const issueId = payload.data?.issueId || payload.data?.complaintId || ''
      const targetUrl = payload.data?.url || (issueId ? `/complaints/${issueId}` : '/notifications')

      event.waitUntil(
        self.registration.showNotification(title, {
          body: message,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          data: {
            url: targetUrl,
            issueId,
          },
        })
      )
    } catch (err) {
      console.warn('SW fallback push handler error:', err)
    }
  })
}

// Deep-link notification clicks directly to the complaint details page
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/notifications'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. Focus an existing window that is already on the target URL
      for (const client of windowClients) {
        if (client.url && client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus()
        }
      }
      // 2. Or navigate an existing app tab to the target URL and focus it
      for (const client of windowClients) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(targetUrl).then((c) => c.focus())
        }
      }
      // 3. Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
