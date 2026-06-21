const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const settingsFile = path.join(__dirname, 'settings.json')

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg']

// Entspricht dem bisherigen, fest codierten Verhalten
const DEFAULTS = {
  photo: {
    resolution: '1024x768',
    format: 'png',
    iso: 800,
    exposureMode: 'auto',
    meteringMode: 'average',
    awbMode: 'auto',
    awbRedGain: 1.0,
    awbBlueGain: 1.0,
    ev: 0,
  },
  video: {
    resolution: '640x480',
    duration: 10000,
    fps: 30,
    bitrate: 0,
  },
  conversion: {
    mode: 'reencode',
  },
}

// Empfehlungen für NoIR Camera v2 / IMX219 (legacy raspistill oder libcamera)
const RECOMMENDED = {
  photo: {
    resolution: '1640x1232',
    format: 'jpg',
    iso: 0,
    exposureMode: 'sports',
    meteringMode: 'backlit',
    awbMode: 'auto',
    awbRedGain: 1.0,
    awbBlueGain: 1.0,
    ev: 0,
  },
  video: {
    resolution: '640x480',
    duration: 10000,
    fps: 25,
    bitrate: 1500000,
  },
  conversion: {
    mode: 'copy',
  },
}

// Empfehlungen für Original Camera v1 / OV5647 (libcamera auf neuerem Pi)
const RECOMMENDED_OV5647 = {
  photo: {
    resolution: '1296x972',
    format: 'jpg',
    iso: 0,
    exposureMode: 'sports',
    meteringMode: 'average',
    awbMode: 'auto',
    awbRedGain: 1.0,
    awbBlueGain: 1.0,
    ev: 0,
  },
  video: {
    resolution: '1296x972',
    duration: 10000,
    fps: 30,
    bitrate: 1500000,
  },
  conversion: {
    mode: 'copy',
  },
}

// ── Kamera-Backend-Erkennung ─────────────────────────────────────────────────

let detectedBackend = null // 'rpicam' | 'libcamera' | 'legacy' | 'none'

const detectCameraBackend = () => {
  const checks = [
    { cmd: 'rpicam-still',    result: 'rpicam'    }, // Raspberry Pi OS Bookworm+
    { cmd: 'libcamera-still', result: 'libcamera' }, // Bullseye mit libcamera-apps
    { cmd: 'raspistill',      result: 'legacy'    }, // älteres Pi OS
  ]
  for (const { cmd, result } of checks) {
    try {
      execSync(`which ${cmd}`, { stdio: 'ignore' })
      detectedBackend = result
      console.log(`[camera] Backend erkannt: ${detectedBackend} (${cmd})`)
      return detectedBackend
    } catch (_) {}
  }
  detectedBackend = 'none'
  console.warn('[camera] Kein Kamera-Backend gefunden (rpicam-still/libcamera-still/raspistill).')
  return detectedBackend
}

// Einmalig beim Laden des Moduls ausführen
detectCameraBackend()

const getCameraBackend = () => detectedBackend

const getStillCmd = () => {
  if (detectedBackend === 'rpicam')    return 'rpicam-still'
  if (detectedBackend === 'libcamera') return 'libcamera-still'
  return 'raspistill'
}

const getVidCmd = () => {
  if (detectedBackend === 'rpicam')    return 'rpicam-vid'
  if (detectedBackend === 'libcamera') return 'libcamera-vid'
  return 'raspivid'
}

// ── Settings-Persistenz ──────────────────────────────────────────────────────

let cache = null

const mergeWithDefaults = (settings) => ({
  photo: { ...DEFAULTS.photo, ...(settings && settings.photo) },
  video: { ...DEFAULTS.video, ...(settings && settings.video) },
  conversion: { ...DEFAULTS.conversion, ...(settings && settings.conversion) },
})

const loadSettings = () => {
  if (cache) return cache

  if (fs.existsSync(settingsFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
      cache = mergeWithDefaults(raw)
      return cache
    } catch (e) {
      console.error('Could not read config/settings.json, using defaults', e)
    }
  }

  cache = mergeWithDefaults(DEFAULTS)
  return cache
}

const saveSettings = (settings) => {
  const merged = mergeWithDefaults(settings)
  if (!fs.existsSync(__dirname)) {
    fs.mkdirSync(__dirname, { recursive: true })
  }
  fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2))
  cache = merged
  return cache
}

const parseResolution = (resolution) => {
  const [width, height] = resolution.split('x').map(Number)
  return { width, height }
}

// ── Argument-Builder ─────────────────────────────────────────────────────────

const buildStillArgs = (settings, outputPath) => {
  const { photo } = settings
  const { width, height } = parseResolution(photo.resolution)

  if (detectedBackend === 'libcamera' || detectedBackend === 'rpicam') {
    const args = [
      '-o', outputPath,
      '--width', String(width),
      '--height', String(height),
      '--encoding', photo.format,
    ]
    // ISO → analoger Gain (ISO 100 ≈ Gain 1.0)
    if (photo.iso > 0) args.push('--gain', String(photo.iso / 100))
    if (photo.exposureMode && photo.exposureMode !== 'auto') {
      // libcamera-still: 'sport' statt 'sports'
      args.push('--exposure', photo.exposureMode === 'sports' ? 'sport' : photo.exposureMode)
    }
    if (photo.meteringMode && photo.meteringMode !== 'average') {
      // rpicam/libcamera metering modes: centre | spot | average | custom
      const mm = photo.meteringMode === 'backlit' ? 'centre'
               : photo.meteringMode === 'matrix'  ? 'average'
               : photo.meteringMode
      args.push('--metering', mm)
    }
    if (photo.ev) args.push('--ev', String(photo.ev))
    if (photo.awbMode === 'off') args.push('--awbgains', `${photo.awbRedGain},${photo.awbBlueGain}`)
    return args
  }

  // legacy (raspistill)
  const args = ['-o', outputPath, '-e', photo.format, '-w', String(width), '-h', String(height)]
  if (photo.iso > 0) args.push('-ISO', String(photo.iso))
  if (photo.exposureMode && photo.exposureMode !== 'auto') args.push('-ex', photo.exposureMode)
  if (photo.meteringMode && photo.meteringMode !== 'average') args.push('-mm', photo.meteringMode)
  if (photo.ev) args.push('-ev', String(photo.ev))
  if (photo.awbMode === 'off') args.push('-awb', 'off', '-awbg', `${photo.awbRedGain},${photo.awbBlueGain}`)
  return args
}

const buildVidArgs = (settings, outputPath) => {
  const { video } = settings
  const { width, height } = parseResolution(video.resolution)

  if (detectedBackend === 'libcamera' || detectedBackend === 'rpicam') {
    const args = [
      '-o', outputPath,
      '-t', String(video.duration),
      '--width', String(width),
      '--height', String(height),
      '--framerate', String(video.fps),
    ]
    if (video.bitrate > 0) args.push('--bitrate', String(video.bitrate))
    return args
  }

  // legacy (raspivid)
  const args = ['-o', outputPath, '-t', String(video.duration), '-w', String(width), '-h', String(height), '-fps', String(video.fps)]
  if (video.bitrate > 0) args.push('-b', String(video.bitrate))
  return args
}

const getConversionOutputOptions = (settings) => {
  if (settings.conversion.mode === 'copy') {
    return ['-r', String(settings.video.fps), '-c:v', 'copy']
  }
  return ['-c:v', 'libx264', '-preset', 'fast']
}

module.exports = {
  DEFAULTS,
  RECOMMENDED,
  RECOMMENDED_OV5647,
  IMAGE_EXTENSIONS,
  detectCameraBackend,
  getCameraBackend,
  getStillCmd,
  getVidCmd,
  loadSettings,
  saveSettings,
  buildStillArgs,
  buildVidArgs,
  getConversionOutputOptions,
}
