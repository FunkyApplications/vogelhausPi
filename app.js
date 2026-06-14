require('dotenv').config()
//const config = require('./config')
var express = require('express');
var hbs = require('express-handlebars');
var cookieParser = require('cookie-parser')
const session = require('express-session')
var fs = require('fs')
var path = require('path');
// var morgan = require('morgan');
var bodyParser = require('body-parser');
const uuid = require('uuid').v1;
var CronJob = require('cron').CronJob;
const { exec } = require("child_process");

var app = express();
app.use(cookieParser())
// View Engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.engine('hbs', hbs.engine({
  extname: 'hbs',
  defaultView: 'default',
  layoutsDir: __dirname + '/views/pages/',
  partialsDir: __dirname + '/views/partials/',
  helpers: {
    json: function(object) {
      return JSON.stringify(object, '//n', 2);
    },
    prettifyDate: function(timestamp) {
      return new Date(Number(timestamp)).toLocaleString()
    },
    humanFileSize: function(bytes) {
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
    },
    realIndex: function(index) {
      return index + 1
    },
    eq: function(a, b) {
      return a === b
    }
  }
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/static', express.static('public'));
app.use('/download', express.static('download'));
app.use('/tablefilter', express.static('node_modules/tablefilter/dist/tablefilter/'));
app.use('/fontawesome', express.static('node_modules/@fortawesome/fontawesome-free/'));
app.use('/materialize/css', express.static('node_modules/materialize-css/dist/css'));
app.use('/materialize/js', express.static('node_modules/materialize-css/dist/js'));
app.use('/materializeInit/js', express.static('static/js'));
app.use('/static/css', express.static('static/css'));
app.use('/data/', express.static('data/'));

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Dateiverzeichnis erstellt.');
}

app.use(function(req, res, next) {
  const files = fs.readdirSync('data')

  res.locals.pictures = []
  res.locals.videos = []

  if (files && files.length) {

    files.forEach((file, i) => {
      const fileType = file.split('.').pop()
      if (fileType == 'png') {
        res.locals.pictures.push(file)
      }
      if (fileType == 'h264') {
        res.locals.videos.push(file)
      }
    });

    res.locals.top10pictures = res.locals.pictures.reverse().slice(0, Math.min(res.locals.pictures.length, 8))
    res.locals.top10videos = res.locals.videos.reverse().slice(0, Math.min(res.locals.videos.length, 8))
  }
  next()
})

// CRONJOB für Täglich neues Foto
const dailyPicCron = new CronJob('0 11 * * *', function(req, res, next) {
  const d = new Date()
  var todayDate = d.toISOString().slice(0, 10);
  const time = d.toTimeString().split(' ')[0].replace(':', '').replace(':', '');
  const command = `raspistill -o ~/Projects/vogelhausPi/data/${todayDate}_${time}.png -e png -w 1024 -h 768 -ISO 800`
  console.log(`Foto am ${todayDate}_${time} automatisch erstellt`);
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
    //res.redirect("/")
  });
  //console.log(cypherString);
}, null, true, 'Europe/Berlin');


const { processMain } = require('./middleware/appMain');

processMain(app);

app.listen(3000, console.log('Server Started on Port 3000'), function(req, res, next) {
  console.log('Automatische Fotoerstellung Taglich um 12 Uhr aktiv');
  dailyPicCron.start()
})
