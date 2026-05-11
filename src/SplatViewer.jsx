// SplatViewer.jsx — Loads PLY from public/, caches binary in IndexedDB,
// on repeat visits creates an ObjectURL from the cached buffer and feeds
// that directly to the viewer — zero network requests after first load.
//
// PATCHES:
//  1. WebGL context-loss  → viewer disposed, RAF loop stopped (was crashing)
//  2. WebGL context-restore → full re-init from IndexedDB cache (fast path)
//  3. All useRef calls are at component top level — fixes React error #321

import { useEffect, useRef, useCallback } from 'react'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'
import { getCachedModel, setCachedModel } from './useSplatCache.js'
import { detectGPUTier, getGPUOptimizations, checkVRSupport } from './gpuUtils.js'

const SPLAT_FILE = '/scene.ply'
const CACHE_KEY  = `splat:${SPLAT_FILE}`

export default function SplatViewer({ onStatus, onProgress, onVRStatus, onGPUInfo, onReady }) {
  // ── All refs declared at top level (Rules of Hooks) ──────────────────────
  const containerRef        = useRef(null)
  const viewerRef           = useRef(null)
  const objectUrlRef        = useRef(null)
  const cancelledRef        = useRef(false)
  const lostListenerRef     = useRef(null)
  const restoredListenerRef = useRef(null)

  // ── Teardown ──────────────────────────────────────────────────────────────
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

  // ── Detach WebGL context listeners from the viewer canvas ─────────────────
  const detachContextHandlers = useCallback(() => {
    const canvas = containerRef.current?.querySelector('canvas')
    if (!canvas) return
    if (lostListenerRef.current) {
      canvas.removeEventListener('webglcontextlost', lostListenerRef.current)
      lostListenerRef.current = null
    }
    if (restoredListenerRef.current) {
      canvas.removeEventListener('webglcontextrestored', restoredListenerRef.current)
      restoredListenerRef.current = null
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false

    // ── init — runs on first mount and after every context restore ───────────
    async function init() {
      if (!containerRef.current || cancelledRef.current) return

      // 1. GPU detection
      const gpuTier = detectGPUTier()
      const opts    = getGPUOptimizations(gpuTier)
      onGPUInfo?.({ tier: gpuTier, ...opts })
      onStatus?.('Detecting capabilities...')

      // 2. VR check
      const vrStatus = await checkVRSupport()
      onVRStatus?.(vrStatus)
      if (cancelledRef.current) return

      // 3. Build viewer
      const viewer = new GaussianSplats3D.Viewer({
        el:                            containerRef.current,
        selfDrivenMode:                true,
        useBuiltInControls:            true,
        gpuAcceleratedSort:            opts.gpuAcceleratedSort,
        halfPrecisionCovariancesOnGPU: opts.halfPrecisionCovariancesOnGPU,
        dynamicScene:                  opts.dynamicScene,
        freeIntermediateSplatData:     opts.freeIntermediateSplatData,
        antialiased:                   opts.antialias,
        devicePixelRatio:              opts.pixelRatio,
        xrEnabled:                     vrStatus.supported,
        xrSessionInit: vrStatus.supported
          ? { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] }
          : undefined,
        xrReferenceSpaceType: 'local-floor',
        logLevel: GaussianSplats3D.LogLevel?.None ?? 0,
      })

      if (cancelledRef.current) { viewer.dispose(); return }
      viewerRef.current = viewer

      // 4. Attach WebGL context-loss / restore handlers to the viewer canvas.
      //    Must happen after viewer creation (canvas doesn't exist before that).
      //    We detach any previous listeners first to avoid duplicates on re-init.
      detachContextHandlers()

      const canvas = containerRef.current?.querySelector('canvas')
      if (canvas) {
        lostListenerRef.current = (e) => {
          // preventDefault() is required — without it the browser never fires
          // contextrestored and the viewer stays broken forever.
          e.preventDefault()
          console.warn('[SplatViewer] WebGL context lost — disposing viewer')
          onStatus?.('GPU context lost — recovering...')
          // Dispose cleanly so the self-driven RAF loop stops.
          // Without this the loop keeps calling render() on invalid GPU state
          // → the "Cannot read properties of undefined (reading 'complete')"
          // TypeError you were seeing on every animation frame.
          cleanup()
        }

        restoredListenerRef.current = () => {
          console.warn('[SplatViewer] WebGL context restored — re-initialising')
          onStatus?.('Reloading...')
          onProgress?.(0)
          // Re-run init. IndexedDB cache is already warm → no network fetch.
          init().catch((err) => {
            console.error('[SplatViewer] Re-init after context restore failed:', err)
            onStatus?.(`Recovery failed: ${err.message}`)
          })
        }

        canvas.addEventListener('webglcontextlost',     lostListenerRef.current,     false)
        canvas.addEventListener('webglcontextrestored', restoredListenerRef.current, false)
      }

      // 5. Try IndexedDB cache
      onStatus?.('Checking cache...')
      let buffer = null
      try {
        const cached = await getCachedModel(CACHE_KEY)
        if (cached?.data instanceof ArrayBuffer && cached.data.byteLength > 0) {
          buffer = cached.data
          console.log('[SplatViewer] Loaded from IndexedDB —',
            (buffer.byteLength / 1024 / 1024).toFixed(1), 'MB')
        }
      } catch (e) {
        console.warn('[SplatViewer] Cache read failed:', e)
      }

      // 6. Fetch from /public if not cached
      if (!buffer) {
        onStatus?.('Downloading model...')
        buffer = await fetchWithProgress(SPLAT_FILE, (pct) => {
          onProgress?.(Math.round(pct * 0.80))
        })
        onStatus?.('Caching model...')
        setCachedModel(CACHE_KEY, buffer)
          .then(() => console.log('[SplatViewer] Model cached in IndexedDB'))
          .catch((e) => console.warn('[SplatViewer] Cache write failed:', e))
      } else {
        onProgress?.(80)
      }

      if (cancelledRef.current) { cleanup(); return }

      // 7. ObjectURL → viewer
      onStatus?.('Preparing scene...')
      onProgress?.(85)
      const blob      = new Blob([buffer], { type: 'application/octet-stream' })
      const objectUrl = URL.createObjectURL(blob) + '#scene.ply'
      objectUrlRef.current = objectUrl

      if (cancelledRef.current) { cleanup(); return }

      onStatus?.('Parsing splat data...')
      await viewer.addSplatScene(objectUrl, {
        format:                     GaussianSplats3D.SceneFormat?.Ply ?? 2,
        splatAlphaRemovalThreshold: 5,
        showLoadingUI:              false,
        progressiveLoad:            false,
        onProgress: (pct) => {
          onProgress?.(85 + Math.round(pct * 0.15))
        },
      })

      if (cancelledRef.current) { cleanup(); return }

      onProgress?.(100)
      onStatus?.('Ready')
      onReady?.()
      viewer.start()
    }

    init().catch((err) => {
      console.error('[SplatViewer] Init error:', err)
      onStatus?.(`Error: ${err.message}`)
    })

    // ── Cleanup on unmount ─────────────────────────────────────────────────
    return () => {
      cancelledRef.current = true
      detachContextHandlers()
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

// ── Streaming fetch with progress ─────────────────────────────────────────────
async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)

  const total  = parseInt(res.headers.get('content-length') ?? '0', 10)
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

  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
  return out.buffer
}
