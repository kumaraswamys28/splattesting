// SplatViewer.jsx — Loads PLY from public/, caches binary in IndexedDB,
// on repeat visits creates an ObjectURL from the cached buffer and feeds
// that directly to the viewer — zero network requests after first load.

import { useEffect, useRef, useCallback } from 'react'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'
import { getCachedModel, setCachedModel } from './useSplatCache.js'
import { detectGPUTier, getGPUOptimizations, checkVRSupport } from './gpuUtils.js'

// ── Change this to match your file in /public ──────────────────────────────
const SPLAT_FILE = '/scene.ply'
// ───────────────────────────────────────────────────────────────────────────

// Stable IndexedDB key (origin + path, no query-string noise)
const CACHE_KEY = `splat:${SPLAT_FILE}`

export default function SplatViewer({ onStatus, onProgress, onVRStatus, onGPUInfo, onReady }) {
  const containerRef = useRef(null)
  const viewerRef    = useRef(null)
  const objectUrlRef = useRef(null)   // track so we can revoke on unmount

  const cleanup = useCallback(() => {
    if (viewerRef.current) {
      try { viewerRef.current.dispose() } catch {}
      viewerRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function init() {
      // ── 1. GPU detection ─────────────────────────────────────────────────
      const gpuTier = detectGPUTier()
      const opts    = getGPUOptimizations(gpuTier)
      onGPUInfo?.({ tier: gpuTier, ...opts })
      onStatus?.('Detecting capabilities...')

      // ── 2. VR check ──────────────────────────────────────────────────────
      const vrStatus = await checkVRSupport()
      onVRStatus?.(vrStatus)

      // ── 3. Build viewer ──────────────────────────────────────────────────
      const viewer = new GaussianSplats3D.Viewer({
        el: containerRef.current,
        selfDrivenMode:               true,
        useBuiltInControls:           true,
        gpuAcceleratedSort:           opts.gpuAcceleratedSort,
        halfPrecisionCovariancesOnGPU: opts.halfPrecisionCovariancesOnGPU,
        dynamicScene:                 opts.dynamicScene,
        freeIntermediateSplatData:    opts.freeIntermediateSplatData,
        antialiased:                  opts.antialias,
        devicePixelRatio:             opts.pixelRatio,
        xrEnabled:                    vrStatus.supported,
        xrSessionInit: vrStatus.supported ? {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
        } : undefined,
        xrReferenceSpaceType: 'local-floor',
        logLevel: GaussianSplats3D.LogLevel?.None ?? 0,
      })

      if (cancelled) { viewer.dispose(); return }
      viewerRef.current = viewer

      // ── 4. Try IndexedDB cache first ─────────────────────────────────────
      onStatus?.('Checking cache...')
      let buffer = null

      try {
        const cached = await getCachedModel(CACHE_KEY)
        if (cached?.data instanceof ArrayBuffer && cached.data.byteLength > 0) {
          buffer = cached.data
          console.log('[SplatViewer] Loaded from IndexedDB cache —',
            (buffer.byteLength / 1024 / 1024).toFixed(1), 'MB')
        }
      } catch (e) {
        console.warn('[SplatViewer] Cache read failed:', e)
      }

      // ── 5. Fetch from /public if not cached ───────────────────────────────
      if (!buffer) {
        onStatus?.('Downloading model...')
        buffer = await fetchWithProgress(SPLAT_FILE, (pct) => {
          onProgress?.(Math.round(pct * 0.80)) // 0–80% for download
        })

        // Store in IndexedDB (fire-and-forget, don't block render)
        onStatus?.('Caching model...')
        setCachedModel(CACHE_KEY, buffer)
          .then(() => console.log('[SplatViewer] Model cached in IndexedDB'))
          .catch((e) => console.warn('[SplatViewer] Cache write failed:', e))
      } else {
        onProgress?.(80)
      }

      if (cancelled) { cleanup(); return }

      // ── 6. Create an ObjectURL from the ArrayBuffer so the viewer can load it
      //       We preserve the .ply extension so the library infers format correctly.
      onStatus?.('Preparing scene...')
      onProgress?.(85)

      const blob      = new Blob([buffer], { type: 'application/octet-stream' })
      // Trick: append #scene.ply so sceneFormatFromPath() sees the .ply extension
      const objectUrl = URL.createObjectURL(blob) + '#scene.ply'
      objectUrlRef.current = objectUrl

      if (cancelled) { cleanup(); return }

      // ── 7. Hand the ObjectURL to the viewer ──────────────────────────────
      onStatus?.('Parsing splat data...')
      await viewer.addSplatScene(objectUrl, {
        format:                    GaussianSplats3D.SceneFormat?.Ply ?? 2, // explicit format
        splatAlphaRemovalThreshold: 5,
        showLoadingUI:             false,
        progressiveLoad:           false,
        onProgress: (pct) => {
          onProgress?.(85 + Math.round(pct * 0.15)) // 85–100%
        },
      })

      if (cancelled) { cleanup(); return }

      onProgress?.(100)
      onStatus?.('Ready')
      onReady?.()
      viewer.start()
    }

    init().catch((err) => {
      console.error('[SplatViewer] Init error:', err)
      onStatus?.(`Error: ${err.message}`)
    })

    return () => {
      cancelled = true
      cleanup()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  )
}

// ── Streaming fetch with progress callback ───────────────────────────────────
async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)

  const contentLength = res.headers.get('content-length')
  const total         = contentLength ? parseInt(contentLength, 10) : 0

  const reader = res.body.getReader()
  const chunks = []
  let loaded   = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (total > 0) onProgress(loaded / total)
  }

  // Assemble chunks into a single ArrayBuffer
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out.buffer
}
