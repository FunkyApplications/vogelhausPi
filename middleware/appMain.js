const fs = require('fs')
const { exec } = require("child_process");

processMain = (app) => {

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
    const command = "raspivid -o /data/${todayDate}_${time}.h264 -t 50000 -w 640 -h 480"
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

  app.get('/Galerie', function(req, res) {
    const files = fs.readdirSync('data')

    res.locals.files =(files||[]).reverse()

    res.render('Galerie')
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
