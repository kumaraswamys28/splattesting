// useSplatCache.js — IndexedDB-backed binary cache for large .ply files
// Service Worker handles HTTP-level caching; this provides a programmatic API

const DB_NAME = 'SplatViewerDB'
const DB_VERSION = 1
const STORE_NAME = 'models'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getCachedModel(url) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(url)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function setCachedModel(url, data, meta = {}) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).put({
        url,
        data,
        timestamp: Date.now(),
        size: data.byteLength,
        ...meta
      })
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return false
  }
}

export async function getCacheInfo() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).getAll()
      req.onsuccess = () => {
        const entries = req.result || []
        resolve({
          count: entries.length,
          totalSize: entries.reduce((s, e) => s + (e.size || 0), 0),
          entries: entries.map(({ url, timestamp, size }) => ({ url, timestamp, size }))
        })
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return { count: 0, totalSize: 0, entries: [] }
  }
}

export async function clearCache() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).clear()
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return false
  }
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
