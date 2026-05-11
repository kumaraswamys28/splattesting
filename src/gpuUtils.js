// gpuUtils.js — GPU capability detection and optimization presets

/**
 * Detect GPU tier from WebGL renderer string
 */
export function detectGPUTier() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return 'low'

    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return 'medium'

    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || ''
    const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || ''

    const r = renderer.toLowerCase()
    const v = vendor.toLowerCase()

    // High-end GPUs
    if (
      r.includes('rtx') ||
      r.includes('rx 6') || r.includes('rx 7') ||
      r.includes('radeon pro') ||
      r.includes('apple m') ||
      r.includes('a14') || r.includes('a15') || r.includes('a16') || r.includes('a17')
    ) return 'high'

    // Integrated / low-end
    if (
      r.includes('intel') ||
      r.includes('mesa') ||
      r.includes('llvmpipe') ||
      r.includes('swiftshader') ||
      v.includes('microsoft')
    ) return 'low'

    return 'medium'
  } catch {
    return 'medium'
  }
}

/**
 * Returns optimization settings based on GPU tier
 */
export function getGPUOptimizations(tier) {
  const presets = {
    high: {
      maxSplatCount: 2_000_000,
      splatSortDistanceMapPrecision: 16,
      dynamicScene: false,
      freeIntermediateSplatData: true,
      gpuAcceleratedSort: true,
      halfPrecisionCovariancesOnGPU: false,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      antialias: true,
      label: 'High Quality',
    },
    medium: {
      maxSplatCount: 1_000_000,
      splatSortDistanceMapPrecision: 16,
      dynamicScene: false,
      freeIntermediateSplatData: true,
      gpuAcceleratedSort: true,
      halfPrecisionCovariancesOnGPU: true,
      pixelRatio: Math.min(window.devicePixelRatio, 1.5),
      antialias: false,
      label: 'Balanced',
    },
    low: {
      maxSplatCount: 500_000,
      splatSortDistanceMapPrecision: 8,
      dynamicScene: false,
      freeIntermediateSplatData: true,
      gpuAcceleratedSort: false,
      halfPrecisionCovariancesOnGPU: true,
      pixelRatio: 1,
      antialias: false,
      label: 'Performance',
    },
  }
  return presets[tier] || presets.medium
}

/**
 * Check WebXR VR support
 */
export async function checkVRSupport() {
  if (!navigator.xr) return { supported: false, reason: 'WebXR not available' }
  try {
    const supported = await navigator.xr.isSessionSupported('immersive-vr')
    return { supported, reason: supported ? 'VR ready' : 'No VR headset detected' }
  } catch (e) {
    return { supported: false, reason: e.message }
  }
}

/**
 * Get WebGL2 capabilities summary
 */
export function getGLCapabilities() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return { webgl2: false }

    return {
      webgl2: true,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
      maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
      maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
    }
  } catch {
    return { webgl2: false }
  }
}
