const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const ffmpeg = require('fluent-ffmpeg')
const packageJson = require('../package.json');
const {
  DEFAULTS: SETTINGS_DEFAULTS,
  RECOMMENDED: SETTINGS_RECOMMENDED,
  RECOMMENDED_OV5647: SETTINGS_RECOMMENDED_OV5647,
  IMAGE_EXTENSIONS,
  getCameraBackend,
  getStillCmd,
  getVidCmd,
  loadSettings,
  saveSettings,
  buildStillArgs,
  buildVidArgs,
  getConversionOutputOptions,
} = require('../config/settings')

// Performance: Cache für Dateisystem-Operationen
let galleryCache = null
let cacheTimestamp = 0
const CACHE_TTL = 5000 // 5 Sekunden

const humanFileSize = function(bytes) {
  if (bytes === 0) return '0 B'
  const thresh = 1024
  if (Math.abs(bytes) < thresh) return bytes + ' B'
  const units = ['KB', 'MB', 'GB', 'TB']
  let u = -1
  do {
    bytes /= thresh
    ++u
  } while (Math.abs(bytes) >= thresh && u < units.length - 1)
  return bytes.toFixed(1) + ' ' + units[u]
}

// Logging: write to log/gallery.log
const logDir = path.join(__dirname, '..', 'log')
if (!fs.existsSync(logDir)) {
  try { fs.mkdirSync(logDir, { recursive: true }) } catch (e) { console.error('Could not create log dir', e) }
}
const logFile = path.join(logDir, 'gallery.log')
const appendLog = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  fs.appendFile(logFile, line, (err) => { if (err) console.error('log write error', err) })
  console.log(msg)
}

const prettifyDate = function(timestamp) {
  return new Date(Number(timestamp)).toLocaleString()
}

processMain = (app) => {
  const galleryPageSize = 20

  // Middleware to inject version into all views
  app.use((req, res, next) => {
    res.locals.version = packageJson.version
    next()
  })

  // Performance: Erstelle Thumbnail-Verzeichnis falls nicht vorhanden
  const thumbDir = path.join(__dirname, '..', 'data', '.thumbnails')
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir, { recursive: true })
  }

  // Performance: Generiere Thumbnail für ein Bild
  const generateThumbnail = (filename, callback) => {
    const sourceFile = path.join(__dirname, '..', 'data', filename)
    const thumbFile = path.join(thumbDir, `${filename}.thumb.jpg`)
    
    // Thumbnail existiert bereits
    if (fs.existsSync(thumbFile)) {
      appendLog(`[gallery] thumbnail exists: ${thumbFile}`)
      return callback(null, true)
    }
    
    const ext = path.extname(filename).slice(1).toLowerCase()
    if (!IMAGE_EXTENSIONS.includes(ext) && ext !== 'mp4') {
      appendLog(`[gallery] thumbnail skipped (unsupported ext): ${filename}`)
      return callback(null, false)
    }
    
    // Generiere Thumbnail mit ffmpeg
    appendLog(`[gallery] generating thumbnail for ${filename}`)
    ffmpeg(sourceFile)
      .screenshot({
        timestamps: [0],
        filename: `${filename}.thumb.jpg`,
        folder: thumbDir,
        size: '120x90'
      })
      .on('end', () => {
        appendLog(`[gallery] thumbnail generated: ${thumbFile}`)
        callback(null, true)
      })
      .on('error', (err) => {
        appendLog(`[gallery] thumbnail error for ${filename}: ${err && err.message ? err.message : err}`)
        // Defekte (z.B. 0 Byte) Mediendateien aufräumen, damit sie nicht immer wieder fehlschlagen
        if (ext === 'mp4' && fs.existsSync(sourceFile) && fs.statSync(sourceFile).size === 0) {
          fs.unlink(sourceFile, (unlinkErr) => {
            if (unlinkErr) {
              appendLog(`[gallery] could not delete broken file ${filename}: ${unlinkErr}`)
            } else {
              appendLog(`[gallery] deleted broken (0 byte) file ${filename}`)
              galleryCache = null // Liste neu aufbauen, da Datei nicht mehr existiert
            }
          })
        }
        callback(null, false)
      })
  }

  const buildGalleryItems = (filesRaw) => {
    return (filesRaw || []).map((file) => {
        const filepath = path.join('data', file)
        const stats = fs.statSync(filepath)
        const ext = path.extname(file).slice(1).toLowerCase()
        const type = IMAGE_EXTENSIONS.includes(ext) ? 'image' : ext === 'mp4' || ext === 'h264' ? 'video' : 'other'
        const thumbFile = path.join('.thumbnails', `${file}.thumb.jpg`)
        const hasThumbnail = fs.existsSync(path.join(__dirname, '..', 'data', thumbFile))

        // Thumbnail asynchron generieren
        if (!hasThumbnail && (IMAGE_EXTENSIONS.includes(ext) || ext === 'mp4')) {
          generateThumbnail(file, () => {})
        }

        return {
          name: file,
          type: type,
          isImage: type === 'image',
          isVideo: type === 'video',
          size: stats.size,
          mtime: stats.mtimeMs,
          sizeText: humanFileSize(stats.size),
          dateText: prettifyDate(stats.mtimeMs),
          thumbnail: hasThumbnail ? `/data/${thumbFile}` : null,
        }
      })
  }

  // Performance: Cached Gallery List
  const getCachedGalleryItems = () => {
    const now = Date.now()
    if (galleryCache && (now - cacheTimestamp) < CACHE_TTL) {
      appendLog(`[gallery] returning cached list (${galleryCache.length} items)`)
      return galleryCache
    }
    
    let names = []
    const dataDir = path.join(__dirname, '..', 'data')
    if (fs.existsSync(dataDir)) {
      names = fs.readdirSync(dataDir)
        .filter(f => !f.startsWith('.'))
        .filter(f => {
          const ext = path.extname(f).slice(1).toLowerCase()
          return IMAGE_EXTENSIONS.includes(ext) || ext === 'mp4'
        })
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
      appendLog(`[gallery] rebuilding gallery list, found ${names.length} files`)
    }

    galleryCache = names
    cacheTimestamp = now
    return names
  }

  // Get latest image or video for preview
  const getLatestMedia = () => {
    const names = getCachedGalleryItems()
    if (!names.length) return null
    
    for (const name of names) {
      const ext = path.extname(name).slice(1).toLowerCase()
      if (IMAGE_EXTENSIONS.includes(ext) || ext === 'mp4') {
        return { name, ext, isImage: IMAGE_EXTENSIONS.includes(ext) }
      }
    }
    return null
  }

  app.get('/', function(req, res) {
    const latest = getLatestMedia()
    res.locals.latestMedia = latest
    res.render('Start')
  })

  app.get('/takePicture', function(req, res) {
    const settings = loadSettings()
    const d = new Date()
    var todayDate = d.toISOString().slice(0, 10);
    const time = d.toTimeString().split(' ')[0].replace(':', '').replace(':', '');
    const outputFile = path.join(__dirname, '..', 'data', `${todayDate}_${time}.${settings.photo.format}`)
    const stillArgs = buildStillArgs(settings, outputFile)

    const stillCmd = getStillCmd()
    execFile(stillCmd, stillArgs, (error, stdout, stderr) => {
      if (error) appendLog(`[photo] ${stillCmd} error: ${error.message}`)
      if (stdout) appendLog(`[photo] ${stillCmd} stdout: ${stdout}`)
      if (stderr) appendLog(`[photo] ${stillCmd} stderr: ${stderr}`)
      galleryCache = null
      res.redirect("/")
    });
  })

  app.get('/takeVideo', function(req, res) {

    res.redirect("/") // Sofort zurück, Videoaufnahme läuft im Hintergrund weiter

    const settings = loadSettings()
    const d = new Date()
    var todayDate = d.toISOString().slice(0, 10);
    const time = d.toTimeString().split(' ')[0].replace(':', '').replace(':', '');
    const h264File = path.join(__dirname, '..', 'data', `${todayDate}_${time}.h264`)
    const mp4File = path.join(__dirname, '..', 'data', `${todayDate}_${time}.mp4`)

    // Record as h264
    const vidArgs = buildVidArgs(settings, h264File)

    const vidCmd = getVidCmd()
    execFile(vidCmd, vidArgs, (error, stdout, stderr) => {
      if (error) appendLog(`[video] ${vidCmd} error: ${error.message}`)
      if (stdout) appendLog(`[video] ${vidCmd} stdout: ${stdout}`)
      if (stderr) appendLog(`[video] ${vidCmd} stderr: ${stderr}`)

      if (!fs.existsSync(h264File) || fs.statSync(h264File).size === 0) {
        appendLog(`[video] h264 file missing or empty, skipping conversion: ${h264File}`)
        fs.unlink(h264File, () => {})
        return
      }

      // Convert h264 to MP4 for browser compatibility
      ffmpeg(h264File)
        .inputFormat('h264') // raspivid liefert rohen H.264-Stream ohne Container
        .output(mp4File)
        .outputOptions(getConversionOutputOptions(settings))
        .on('stderr', (line) => appendLog(`[video] ffmpeg: ${line}`))
        .on('end', () => {
          appendLog(`[video] conversion complete: ${mp4File}`)
          galleryCache = null
          fs.unlink(h264File, (err) => {
            if (err) appendLog(`[video] error deleting h264: ${err}`)
          })
        })
        .on('error', (err) => {
          appendLog(`[video] error converting: ${err.message}`)
          fs.unlink(mp4File, (errUnlink) => {
            if (!errUnlink) appendLog(`[video] deleted invalid mp4: ${mp4File}`)
          })
          fs.unlink(h264File, (errUnlink) => {
            if (errUnlink) appendLog(`[video] error deleting h264: ${errUnlink}`)
            else appendLog(`[video] deleted h264 after failed conversion: ${h264File}`)
          })
        })
        .run();
    });
  })

  app.get('/Einstellungen', function(req, res) {
    res.render('Einstellungen', {
      settings: loadSettings(),
      recommended: SETTINGS_RECOMMENDED,
      recommendedOv5647: SETTINGS_RECOMMENDED_OV5647,
      defaults: SETTINGS_DEFAULTS,
      saved: req.query.gespeichert === '1',
      cameraBackend: getCameraBackend(),
    })
  })

  app.post('/Einstellungen', function(req, res) {
    const body = req.body || {}
    const settings = {
      photo: {
        resolution: body['photo.resolution'],
        format: body['photo.format'],
        iso: Number(body['photo.iso']),
        exposureMode: body['photo.exposureMode'],
        meteringMode: body['photo.meteringMode'],
        awbMode: body['photo.awbMode'],
        awbRedGain: Number(body['photo.awbRedGain']),
        awbBlueGain: Number(body['photo.awbBlueGain']),
        ev: Number(body['photo.ev']),
      },
      video: {
        resolution: body['video.resolution'],
        duration: Number(body['video.duration']),
        fps: Number(body['video.fps']),
        bitrate: Number(body['video.bitrate']),
      },
      conversion: {
        mode: body['conversion.mode'],
      },
    }
    saveSettings(settings)
    appendLog(`[settings] gespeichert: ${JSON.stringify(settings)}`)
    res.redirect('/Einstellungen?gespeichert=1')
  })

  app.get('/Galerie', function(req, res) {
    const names = getCachedGalleryItems()
    const slice = names.slice(0, galleryPageSize)
    const files = buildGalleryItems(slice)

    res.locals.files = files
    res.locals.moreFiles = names.length > galleryPageSize
    res.locals.galleryCount = names.length
    res.locals.maxGalleryItems = galleryPageSize

    appendLog(`[gallery] GET /Galerie serving ${res.locals.files.length}/${res.locals.galleryCount}`)
    res.render('Galerie')
  })

  app.get('/Galerie/load', function(req, res) {
    const names = getCachedGalleryItems()
    const offset = parseInt(req.query.offset, 10) || 0
    const slice = names.slice(offset, offset + galleryPageSize)
    const nextItems = buildGalleryItems(slice)
    appendLog(`[gallery] GET /Galerie/load offset=${offset} next=${nextItems.length} total=${names.length}`)
    res.json({
      files: nextItems,
      hasMore: offset + galleryPageSize < names.length,
      nextOffset: offset + nextItems.length,
    })
  })

  app.get('/image/:target', function(req, res) {
    const target = path.basename(req.params.target)
    const filepath = path.join(__dirname, '..', 'data', target)

    if (!fs.existsSync(filepath)) {
      return res.status(404).send('Datei nicht gefunden.')
    }

    const ext = path.extname(target).slice(1).toLowerCase()
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      return res.status(404).send('Nur Bilddateien können angezeigt werden.')
    }

    const stats = fs.statSync(filepath)

    // Find previous and next images in sorted list
    const names = getCachedGalleryItems()
    const imageNames = names.filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).slice(1).toLowerCase()))
    const currentIndex = imageNames.indexOf(target)
    const previousImage = currentIndex > 0 ? imageNames[currentIndex - 1] : null
    const nextImage = currentIndex >= 0 && currentIndex < imageNames.length - 1 ? imageNames[currentIndex + 1] : null
    
    res.render('Image', {
      file: target,
      size: stats.size,
      mtime: stats.mtimeMs,
      type: 'Bild',
      previousImage: previousImage,
      nextImage: nextImage,
    })
  })

  app.post('/download', function(req, res) {
    console.log(req.body);
    const { target } = req.body
    if (target) {
      console.log('Hallo');
      const file = `./data/${target}`;
      res.download(file); // Set disposition and send it.
    }
  });

  app.post('/delete/', (req, res, next) => {
    if (req.body && req.body.target) {
      const { target } = req.body
      const filepath = './data/' + target
      fs.unlink(filepath, (err) => {
        if (err) {
	 console.log('Löschen nicht erfolgreich!')
	};
        console.log('Datei wurde gelöscht');
      })
    }
    res.redirect('/Galerie')
  })






}; // Ende Process Metamodel

module.exports = {
  processMain,
};
