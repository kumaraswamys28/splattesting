// App.jsx
import { useState } from 'react'
import SplatViewer from './SplatViewer.jsx'
import HUD from './HUD.jsx'

export default function App() {
  const [status, setStatus] = useState('Initializing...')
  const [progress, setProgress] = useState(0)
  const [vrStatus, setVRStatus] = useState(null)
  const [gpuInfo, setGPUInfo] = useState(null)
  const [isReady, setIsReady] = useState(false)

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      {/* Google Font for monospace */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        button:hover { opacity: 0.8; }
        button:active { transform: scale(0.97); }
      `}</style>

      <SplatViewer
        onStatus={setStatus}
        onProgress={setProgress}
        onVRStatus={setVRStatus}
        onGPUInfo={setGPUInfo}
        onReady={() => setIsReady(true)}
      />

      <HUD
        status={status}
        progress={progress}
        vrStatus={vrStatus}
        gpuInfo={gpuInfo}
        isReady={isReady}
      />
    </div>
  )
}
