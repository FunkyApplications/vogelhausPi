const fs = require('fs')
const path = require('path')

const settingsFile = path.join(__dirname, 'settings.json')

// Bilddatei-Endungen, die von raspistill erzeugt werden können (abhängig von photo.format)
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

// Empfehlungen für NoIR Camera v2 an einem Raspberry Pi Zero WH (Vogelhaus)
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

// Baut die Argumente für `execFile('raspistill', args, ...)`
const buildRaspistillArgs = (settings, outputPath) => {
  const { photo } = settings
  const { width, height } = parseResolution(photo.resolution)
  const args = ['-o', outputPath, '-e', photo.format, '-w', String(width), '-h', String(height)]

  if (photo.iso > 0) args.push('-ISO', String(photo.iso))
  if (photo.exposureMode && photo.exposureMode !== 'auto') args.push('-ex', photo.exposureMode)
  if (photo.meteringMode && photo.meteringMode !== 'average') args.push('-mm', photo.meteringMode)
  if (photo.ev) args.push('-ev', String(photo.ev))

  if (photo.awbMode === 'off') {
    args.push('-awb', 'off', '-awbg', `${photo.awbRedGain},${photo.awbBlueGain}`)
  }

  return args
}

// Baut die Argumente für `execFile('raspivid', args, ...)`
const buildRaspividArgs = (settings, outputPath) => {
  const { video } = settings
  const { width, height } = parseResolution(video.resolution)
  const args = ['-o', outputPath, '-t', String(video.duration), '-w', String(width), '-h', String(height), '-fps', String(video.fps)]

  if (video.bitrate > 0) args.push('-b', String(video.bitrate))

  return args
}

// Baut die fluent-ffmpeg outputOptions für die h264 -> mp4 Konvertierung
const getConversionOutputOptions = (settings) => {
  if (settings.conversion.mode === 'copy') {
    return ['-r', String(settings.video.fps), '-c:v', 'copy']
  }
  return ['-c:v', 'libx264', '-preset', 'fast']
}

module.exports = {
  DEFAULTS,
  RECOMMENDED,
  IMAGE_EXTENSIONS,
  loadSettings,
  saveSettings,
  buildRaspistillArgs,
  buildRaspividArgs,
  getConversionOutputOptions,
}
