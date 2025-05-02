const CACHE_NAME = 'omthings-cache-v1'
const CACHE_UPDATE_INTERVAL = 60 * 60 * 1000 // 1 hour in milliseconds
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.jpg',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400&display=swap',
]

// Helper function to check if a cache entry is older than the update interval
function isOlderThanInterval(cachedResponse) {
  if (!cachedResponse) return true

  const cachedTime = cachedResponse.headers.get('sw-fetched-on')
  if (!cachedTime) return true // If no timestamp, consider it outdated

  const ageInMs = Date.now() - parseInt(cachedTime, 10)
  return ageInMs > CACHE_UPDATE_INTERVAL
}

// Add timestamp to cache entries
function addTimestampToCacheEntry(response) {
  const clonedResponse = response.clone()
  const headers = new Headers(clonedResponse.headers)
  headers.append('sw-fetched-on', Date.now().toString())

  return clonedResponse.blob().then((body) => {
    return new Response(body, {
      status: clonedResponse.status,
      statusText: clonedResponse.statusText,
      headers: headers,
    })
  })
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return Promise.all(
          urlsToCache.map((url) => {
            return fetch(url)
              .then((response) => {
                return addTimestampToCacheEntry(response)
              })
              .then((timestampedResponse) => {
                return cache.put(url, timestampedResponse)
              })
          })
        )
      })
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              addTimestampToCacheEntry(networkResponse).then(
                (timestampedResponse) => {
                  cache.put(event.request, timestampedResponse)
                }
              )
            }
            return networkResponse
          })
          .catch(() => {
            // If network fetch fails, return the cached response regardless of age
            return cachedResponse
          })

        // Check if cached response exists and is still fresh
        if (cachedResponse && !isOlderThanInterval(cachedResponse)) {
          // If cache is fresh, return it but still update in background
          return cachedResponse
        }

        // If cache is older than interval or doesn't exist, wait for network response
        return fetchPromise
      })
    })
  )
})

// Periodically update the cache even when not being used
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-cache') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return Promise.all(
          urlsToCache.map((url) => {
            return fetch(url)
              .then((response) => addTimestampToCacheEntry(response))
              .then((timestampedResponse) =>
                cache.put(url, timestampedResponse)
              )
          })
        )
      })
    )
  }
})
