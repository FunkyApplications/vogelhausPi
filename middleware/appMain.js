const fs = require('fs')
const path = require('path')
const { execFile } = require("child_process");
const ffmpegPath = require('ffmpeg-static');
const packageJson = require('../package.json');

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

  const buildGalleryItems = (filesRaw) => {
    return (filesRaw || [])
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
      .map((file) => {
        const filepath = path.join('data', file)
        const stats = fs.statSync(filepath)
        const ext = path.extname(file).slice(1).toLowerCase()
        const type = ext === 'png' ? 'image' : ext === 'h264' ? 'video' : 'other'

        return {
          name: file,
          type: type,
          isImage: type === 'image',
          isVideo: type === 'video',
          size: stats.size,
          mtime: stats.mtimeMs,
          sizeText: humanFileSize(stats.size),
          dateText: prettifyDate(stats.mtimeMs),
        }
      })
  }

  app.get('/', function(req, res) {
    res.render('Start')
  })

  app.get('/takePicture', function(req, res) {
    const d = new Date()
    var todayDate = d.toISOString().slice(0, 10);
    const time = d.toTimeString().split(' ')[0].replace(':', '').replace(':', '');
    const command = `raspistill -o ~/Projects/vogelhausPi/data/${todayDate}_${time}.png -e png -w 1024 -h 768 -ISO 800`
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      res.redirect("/")
    });
  })

  app.get('/takeVideo', function(req, res) {
    const d = new Date()
    var todayDate = d.toISOString().slice(0, 10);
    const time = d.toTimeString().split(' ')[0].replace(':', '').replace(':', '');
    const h264File = path.join(__dirname, '..', 'data', `${todayDate}_${time}.h264`)
    const mp4File = path.join(__dirname, '..', 'data', `${todayDate}_${time}.mp4`)
    
    // Record as h264
    const raspividArgs = ['-o', h264File, '-t', '10000', '-w', '640', '-h', '480']
    
    execFile('raspivid', raspividArgs, (error) => {
      if (error) {
        console.log(`error recording: ${error.message}`);
        return res.redirect("/")
      }
      
      // Convert h264 to MP4 for browser compatibility
      const ffmpegArgs = ['-i', h264File, '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-y', mp4File]
      execFile(ffmpegPath, ffmpegArgs, (error) => {
        if (error) {
          console.log(`error converting: ${error.message}`);
        }
        // Clean up h264 file
        fs.unlink(h264File, (err) => {
          if (err) console.log(`error deleting h264: ${err}`);
        });
        res.redirect("/")
      });
    });
  })

  app.get('/Galerie', function(req, res) {
    let files = []
    const dataDir = path.join(__dirname, '..', 'data')
    if (fs.existsSync(dataDir)) {
      const filesRaw = fs.readdirSync(dataDir)
      files = buildGalleryItems(filesRaw)
    }

    res.locals.files = files.slice(0, galleryPageSize)
    res.locals.moreFiles = files.length > galleryPageSize
    res.locals.galleryCount = files.length
    res.locals.maxGalleryItems = galleryPageSize

    res.render('Galerie')
  })

  app.get('/Galerie/load', function(req, res) {
    let files = []
    const dataDir = path.join(__dirname, '..', 'data')
    if (fs.existsSync(dataDir)) {
      const filesRaw = fs.readdirSync(dataDir)
      files = buildGalleryItems(filesRaw)
    }
    const offset = parseInt(req.query.offset, 10) || 0
    const nextItems = files.slice(offset, offset + galleryPageSize)
    res.json({
      files: nextItems,
      hasMore: offset + galleryPageSize < files.length,
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
    if (ext !== 'png') {
      return res.status(404).send('Nur Bilddateien können angezeigt werden.')
    }

    const stats = fs.statSync(filepath)
    res.render('Image', {
      file: target,
      size: stats.size,
      mtime: stats.mtimeMs,
      type: 'Bild',
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
