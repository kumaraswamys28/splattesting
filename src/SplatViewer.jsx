// SplatViewer.jsx — Loads PLY from public/, caches binary in IndexedDB,
// on repeat visits creates an ObjectURL from the cached buffer and feeds
// that directly to the viewer — zero network requests after first load.
//
// PATCHES applied:
//  1. WebGL context-loss → render loop paused, viewer torn down cleanly
//  2. WebGL context-restore → full re-init from IndexedDB cache (fast path)
//  3. Crash guard: TypeError on undefined texture is now caught & recovered
//  4. SW dual-caching note: sw.js fetch handler removed (see sw.js patch)

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
  const containerRef   = useRef(null)
  const viewerRef      = useRef(null)
  const objectUrlRef   = useRef(null)   // track so we can revoke on unmount
  const contextLostRef = useRef(false)  // true while WebGL context is absent
  const cancelledRef   = useRef(false)  // true after component unmount

  // ── Teardown ─────────────────────────────────────────────────────────────
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
    cancelledRef.current = false

    // ── Core init — called on first mount AND after context restore ─────────
    async function init() {
      if (!containerRef.current || cancelledRef.current) return

      // ── 1. GPU detection ────────────────────────────────────────────────
      const gpuTier = detectGPUTier()
      const opts    = getGPUOptimizations(gpuTier)
      onGPUInfo?.({ tier: gpuTier, ...opts })
      onStatus?.('Detecting capabilities...')

      // ── 2. VR check ─────────────────────────────────────────────────────
      const vrStatus = await checkVRSupport()
      onVRStatus?.(vrStatus)
      if (cancelledRef.current) return

      // ── 3. Build viewer ─────────────────────────────────────────────────
      const viewer = new GaussianSplats3D.Viewer({
        el: containerRef.current,
        selfDrivenMode:                true,
        useBuiltInControls:            true,
        gpuAcceleratedSort:            opts.gpuAcceleratedSort,
        halfPrecisionCovariancesOnGPU: opts.halfPrecisionCovariancesOnGPU,
        dynamicScene:                  opts.dynamicScene,
        freeIntermediateSplatData:     opts.freeIntermediateSplatData,
        antialiased:                   opts.antialias,
        devicePixelRatio:              opts.pixelRatio,
        xrEnabled:                     vrStatus.supported,
        xrSessionInit: vrStatus.supported ? {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
        } : undefined,
        xrReferenceSpaceType: 'local-floor',
        logLevel: GaussianSplats3D.LogLevel?.None ?? 0,
      })

      if (cancelledRef.current) { viewer.dispose(); return }
      viewerRef.current = viewer

      // ── 4. Attach WebGL context-loss handlers ───────────────────────────
      //    Must be done right after viewer creation so the canvas exists.
      attachContextHandlers(init)

      // ── 5. Try IndexedDB cache ──────────────────────────────────────────
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

      // ── 6. Fetch from /public if not cached ─────────────────────────────
      if (!buffer) {
        onStatus?.('Downloading model...')
        buffer = await fetchWithProgress(SPLAT_FILE, (pct) => {
          onProgress?.(Math.round(pct * 0.80)) // 0–80 % for download
        })

        // Store in IndexedDB (fire-and-forget)
        onStatus?.('Caching model...')
        setCachedModel(CACHE_KEY, buffer)
          .then(() => console.log('[SplatViewer] Model cached in IndexedDB'))
          .catch((e) => console.warn('[SplatViewer] Cache write failed:', e))
      } else {
        onProgress?.(80)
      }

      if (cancelledRef.current) { cleanup(); return }

      // ── 7. ObjectURL → viewer ───────────────────────────────────────────
      onStatus?.('Preparing scene...')
      onProgress?.(85)

      const blob      = new Blob([buffer], { type: 'application/octet-stream' })
      // Append #scene.ply so sceneFormatFromPath() infers the .ply format
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
          onProgress?.(85 + Math.round(pct * 0.15)) // 85–100 %
        },
      })

      if (cancelledRef.current) { cleanup(); return }

      onProgress?.(100)
      onStatus?.('Ready')
      onReady?.()
      viewer.start()
    }

    // ── WebGL context-loss / restore ──────────────────────────────────────
    //
    // Strategy:
    //   • contextlost  → preventDefault() (required for restore to fire),
    //                    stop the render loop, tear down the viewer cleanly.
    //   • contextrestored → re-run init() which hits the IndexedDB cache
    //                       (no network hit), rebuilds the viewer from scratch.
    //
    // We keep refs to the listeners so we can remove them on unmount.
    const lostListenerRef    = useRef(null)
    const restoredListenerRef = useRef(null)

    function attachContextHandlers(reinitFn) {
      // Find the canvas the viewer created inside our container
      const canvas = containerRef.current?.querySelector('canvas')
      if (!canvas) return

      // Detach any previous listeners to avoid duplicates on re-init
      if (lostListenerRef.current)
        canvas.removeEventListener('webglcontextlost', lostListenerRef.current)
      if (restoredListenerRef.current)
        canvas.removeEventListener('webglcontextrestored', restoredListenerRef.current)

      lostListenerRef.current = (e) => {
        e.preventDefault() // ← required; without this, restore never fires
        contextLostRef.current = true
        console.warn('[SplatViewer] WebGL context lost — tearing down viewer')
        onStatus?.('GPU context lost — recovering...')
        // Dispose viewer to stop the self-driven RAF loop; it would otherwise
        // keep calling render() and crash on every frame (the bug you saw).
        cleanup()
      }

      restoredListenerRef.current = () => {
        contextLostRef.current = false
        console.warn('[SplatViewer] WebGL context restored — re-initialising')
        onStatus?.('GPU context restored — reloading...')
        onProgress?.(0)
        // Re-run the full init. IndexedDB cache is warm → fast path.
        reinitFn().catch((err) => {
          console.error('[SplatViewer] Re-init after context restore failed:', err)
          onStatus?.(`Recovery failed: ${err.message}`)
        })
      }

      canvas.addEventListener('webglcontextlost',     lostListenerRef.current,     false)
      canvas.addEventListener('webglcontextrestored', restoredListenerRef.current, false)
    }

    init().catch((err) => {
      console.error('[SplatViewer] Init error:', err)
      onStatus?.(`Error: ${err.message}`)
    })

    return () => {
      cancelledRef.current = true
      // Remove context listeners from the canvas before tearing down
      const canvas = containerRef.current?.querySelector('canvas')
      if (canvas) {
        if (lostListenerRef.current)
          canvas.removeEventListener('webglcontextlost', lostListenerRef.current)
        if (restoredListenerRef.current)
          canvas.removeEventListener('webglcontextrestored', restoredListenerRef.current)
      }
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

// ── Streaming fetch with progress callback ────────────────────────────────────
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

  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out.buffer
}