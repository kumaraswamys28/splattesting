// HUD.jsx — Heads-up display overlay
import { useState, useEffect } from 'react'
import { getCacheInfo, clearCache, formatBytes } from './useSplatCache.js'

export default function HUD({ status, progress, vrStatus, gpuInfo, isReady }) {
  const [showInfo, setShowInfo] = useState(false)
  const [cacheInfo, setCacheInfo] = useState(null)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (showInfo) {
      getCacheInfo().then(setCacheInfo)
    }
  }, [showInfo])

  const handleClearCache = async () => {
    setClearing(true)
    await clearCache()
    const info = await getCacheInfo()
    setCacheInfo(info)
    setClearing(false)
  }

  const handleEnterVR = () => {
    // Trigger WebXR via the viewer's built-in VR button
    const vrBtn = document.querySelector('[data-xr-button]') ||
                  document.querySelector('.xr-button') ||
                  document.querySelector('button[class*="vr"]')
    if (vrBtn) vrBtn.click()
    else alert('Use the VR button in the viewer controls, or ensure a VR headset is connected.')
  }

  return (
    <>
      {/* Top-left branding */}
      <div style={styles.brand}>
        <span style={styles.brandDot} />
        <span style={styles.brandText}>SPLAT VIEWER</span>
      </div>

      {/* Loading overlay */}
      {!isReady && (
        <div style={styles.loadingOverlay}>
          <div style={styles.loadingBox}>
            <div style={styles.loadingTitle}>GAUSSIAN SPLAT</div>
            <div style={styles.loadingSubtitle}>Loading scene...</div>
            <div style={styles.progressBarOuter}>
              <div style={{ ...styles.progressBarInner, width: `${progress}%` }} />
            </div>
            <div style={styles.statusText}>{status}</div>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      {isReady && (
        <div style={styles.controls}>
          {/* VR Button */}
          {vrStatus?.supported && (
            <button style={styles.vrBtn} onClick={handleEnterVR} title="Enter VR">
              <VRIcon />
              <span>ENTER VR</span>
            </button>
          )}
          {vrStatus && !vrStatus.supported && (
            <div style={styles.vrNoSupport} title={vrStatus.reason}>
              <VRIcon muted />
              <span>NO VR</span>
            </div>
          )}

          {/* Info toggle */}
          <button
            style={styles.infoBtn}
            onClick={() => setShowInfo((v) => !v)}
            title="System info"
          >
            <span>{showInfo ? '✕' : 'ℹ'}</span>
          </button>
        </div>
      )}

      {/* GPU + Cache panel */}
      {showInfo && isReady && (
        <div style={styles.panel}>
          <div style={styles.panelTitle}>SYSTEM INFO</div>

          {gpuInfo && (
            <>
              <div style={styles.panelRow}>
                <span style={styles.panelLabel}>GPU TIER</span>
                <span style={{ ...styles.panelValue, color: tierColor(gpuInfo.tier) }}>
                  {gpuInfo.tier?.toUpperCase()} — {gpuInfo.label}
                </span>
              </div>
              <div style={styles.panelRow}>
                <span style={styles.panelLabel}>PIXEL RATIO</span>
                <span style={styles.panelValue}>{gpuInfo.pixelRatio}x</span>
              </div>
              <div style={styles.panelRow}>
                <span style={styles.panelLabel}>GPU SORT</span>
                <span style={styles.panelValue}>{gpuInfo.gpuAcceleratedSort ? '✓ ON' : '✗ OFF'}</span>
              </div>
              <div style={styles.panelRow}>
                <span style={styles.panelLabel}>HALF PREC.</span>
                <span style={styles.panelValue}>{gpuInfo.halfPrecisionCovariancesOnGPU ? '✓ ON' : '✗ OFF'}</span>
              </div>
            </>
          )}

          <div style={styles.divider} />

          <div style={styles.panelTitle}>CACHE</div>
          {cacheInfo ? (
            <>
              <div style={styles.panelRow}>
                <span style={styles.panelLabel}>STORED</span>
                <span style={styles.panelValue}>{cacheInfo.count} model(s)</span>
              </div>
              <div style={styles.panelRow}>
                <span style={styles.panelLabel}>SIZE</span>
                <span style={styles.panelValue}>{formatBytes(cacheInfo.totalSize)}</span>
              </div>
              <button
                style={styles.clearBtn}
                onClick={handleClearCache}
                disabled={clearing}
              >
                {clearing ? 'Clearing...' : 'Clear Cache'}
              </button>
            </>
          ) : (
            <div style={styles.panelValue}>Loading cache info...</div>
          )}

          <div style={styles.divider} />
          <div style={styles.panelTitle}>CONTROLS</div>
          <div style={styles.helpText}>
            🖱 Left drag — orbit<br />
            🖱 Right drag — pan<br />
            🖱 Scroll — zoom<br />
            📱 Pinch — zoom<br />
            🥽 VR — move controllers
          </div>
        </div>
      )}

      {/* Status bar (ready) */}
      {isReady && (
        <div style={styles.statusBar}>
          <span style={styles.statusDot} />
          <span style={styles.statusBarText}>{status}</span>
        </div>
      )}
    </>
  )
}

function VRIcon({ muted }) {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="none" style={{ marginRight: 6 }}>
      <rect x="1" y="1" width="16" height="10" rx="3" stroke={muted ? '#555' : '#4fffb0'} strokeWidth="1.5" />
      <circle cx="6" cy="6" r="2" fill={muted ? '#555' : '#4fffb0'} />
      <circle cx="12" cy="6" r="2" fill={muted ? '#555' : '#4fffb0'} />
      <line x1="8" y1="6" x2="10" y2="6" stroke={muted ? '#555' : '#4fffb0'} strokeWidth="1.5" />
    </svg>
  )
}

function tierColor(tier) {
  return tier === 'high' ? '#4fffb0' : tier === 'medium' ? '#ffd700' : '#ff6b6b'
}

const styles = {
  brand: {
    position: 'fixed',
    top: 20,
    left: 24,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    zIndex: 100,
    pointerEvents: 'none',
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#4fffb0',
    boxShadow: '0 0 8px #4fffb0',
  },
  brandText: {
    fontFamily: "'Space Mono', 'Courier New', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 400,
  },
  loadingOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.88)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  loadingBox: {
    textAlign: 'center',
    width: 320,
  },
  loadingTitle: {
    fontFamily: "'Space Mono', 'Courier New', monospace",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '0.3em',
    color: '#fff',
    marginBottom: 6,
  },
  loadingSubtitle: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.2em',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 28,
  },
  progressBarOuter: {
    width: '100%',
    height: 3,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarInner: {
    height: '100%',
    background: 'linear-gradient(90deg, #4fffb0, #00d4ff)',
    borderRadius: 2,
    transition: 'width 0.3s ease',
    boxShadow: '0 0 8px #4fffb0',
  },
  statusText: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: '0.1em',
  },
  controls: {
    position: 'fixed',
    bottom: 28,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    zIndex: 100,
  },
  vrBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 20px',
    background: 'rgba(79,255,176,0.1)',
    border: '1px solid rgba(79,255,176,0.4)',
    borderRadius: 4,
    color: '#4fffb0',
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.15em',
    cursor: 'pointer',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.2s',
  },
  vrNoSupport: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 4,
    color: '#555',
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.15em',
  },
  infoBtn: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.2s',
  },
  panel: {
    position: 'fixed',
    bottom: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 280,
    background: 'rgba(8,8,14,0.92)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '18px 20px',
    zIndex: 100,
    backdropFilter: 'blur(16px)',
  },
  panelTitle: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 9,
    letterSpacing: '0.25em',
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 10,
  },
  panelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  panelLabel: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 9,
    letterSpacing: '0.1em',
    color: 'rgba(255,255,255,0.35)',
  },
  panelValue: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 9,
    color: 'rgba(255,255,255,0.75)',
  },
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.07)',
    margin: '14px 0',
  },
  clearBtn: {
    marginTop: 8,
    width: '100%',
    padding: '7px 0',
    background: 'rgba(255,107,107,0.1)',
    border: '1px solid rgba(255,107,107,0.3)',
    borderRadius: 4,
    color: '#ff6b6b',
    fontFamily: "'Space Mono', monospace",
    fontSize: 9,
    letterSpacing: '0.1em',
    cursor: 'pointer',
  },
  helpText: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    lineHeight: 1.9,
    letterSpacing: '0.05em',
  },
  statusBar: {
    position: 'fixed',
    bottom: 12,
    right: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    zIndex: 100,
    pointerEvents: 'none',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#4fffb0',
    boxShadow: '0 0 6px #4fffb0',
  },
  statusBarText: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 9,
    letterSpacing: '0.1em',
    color: 'rgba(255,255,255,0.3)',
  },
}
