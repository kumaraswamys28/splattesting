# 🔵 Gaussian Splat Viewer

A high-performance React 19 + Three.js + GaussianSplats3D viewer with **WebXR VR support**, **model caching**, and **GPU-adaptive optimizations**.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Place your .ply file in /public/
cp your-scene.ply public/scene.ply

# 3. Start dev server
npm run dev
```

> Open http://localhost:5173

---

## 📁 File Setup

Place your splat file at:
```
public/scene.ply
```

If your file has a different name, edit `SPLAT_URL` in `src/SplatViewer.jsx`:
```js
const SPLAT_URL = '/your-filename.ply'
```

Supported formats: `.ply`, `.splat`, `.ksplat`

---

## ✨ Features

### 🥽 WebXR VR Support
- Automatic WebXR detection
- Immersive VR with `local-floor` reference space
- Hand-tracking support (if headset supports it)
- Enter VR via the **ENTER VR** button (requires a connected headset)

### ⚡ GPU-Adaptive Optimization
The viewer auto-detects your GPU tier and applies optimal settings:

| Tier | Max Splats | GPU Sort | Half Precision | Pixel Ratio |
|------|-----------|----------|----------------|-------------|
| High | 2,000,000 | ✓ | ✗ | 2x |
| Medium | 1,000,000 | ✓ | ✓ | 1.5x |
| Low | 500,000 | ✗ | ✓ | 1x |

Additional optimizations enabled by default:
- `freeIntermediateSplatData` — frees CPU RAM after GPU upload
- `dynamicScene: false` — enables static-scene fast path

### 💾 Model Caching (Two Layers)
1. **Service Worker** (`/public/sw.js`) — HTTP-level cache via Cache API (survives page reloads)
2. **IndexedDB** — Binary model storage with size tracking and manual clear

On first load: model downloads → stored in both caches
On subsequent loads: served from SW cache (no network request)

View cache stats and clear via the **ℹ** info panel.

---

## 🎮 Controls

| Input | Action |
|-------|--------|
| Left drag | Orbit / rotate |
| Right drag | Pan |
| Scroll | Zoom |
| Pinch | Zoom (mobile) |
| VR controllers | Look around |

---

## 🛠 Build

```bash
npm run build
# Output in /dist
```

The build separates `three` and `react`/`react-dom` into separate chunks for optimal loading.

---

## ⚠️ COOP/COEP Headers

GaussianSplats3D uses Web Workers + SharedArrayBuffer. These require:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are set in `vite.config.js` for dev. For production, configure your server:

**Nginx:**
```nginx
add_header Cross-Origin-Opener-Policy "same-origin";
add_header Cross-Origin-Embedder-Policy "require-corp";
```

**Vercel** (`vercel.json`):
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

---

## 📦 Dependencies

- `react` ^19
- `react-dom` ^19
- `three` ^0.169
- `@mkkellogg/gaussian-splats-3d` ^0.4.7
- `vite` ^6
