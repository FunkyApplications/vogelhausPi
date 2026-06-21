# vogelhausPi

Web frontend for a birdhouse camera based on Raspberry Pi. Allows taking photos and short videos via browser, viewing them in a gallery, and configuring camera settings — all without SSH access.

## Features

- **Live capture** — take a photo or short video from any browser on the local network
- **Gallery** — browse, view, download and delete all captured media
- **Settings page** (`/Einstellungen`) — configure camera parameters and save them persistently
- **Automatic camera backend detection** — works with legacy (`raspistill`/`raspivid`), libcamera (`libcamera-still`/`libcamera-vid`) and rpicam (`rpicam-still`/`rpicam-vid`, Raspberry Pi OS Bookworm+)
- **Daily cron job** — automatically takes a photo at 11:00 every day
- **Video conversion** — h264 → mp4 via ffmpeg for browser playback

## Hardware

Tested with:

| Device | Camera | OS |
|---|---|---|
| Raspberry Pi Zero WH | NoIR Camera Module v2 (IMX219, 8MP) | Raspberry Pi OS Legacy (Bullseye) |
| Raspberry Pi Zero 2 W | Camera Module v1 (OV5647, 5MP) | Raspberry Pi OS Bookworm |

## Requirements

- Node.js (v14+)
- `ffmpeg` installed on the Pi (`sudo apt install ffmpeg`)
- One of the following camera tools in PATH:
  - `rpicam-still` / `rpicam-vid` (Raspberry Pi OS Bookworm+)
  - `libcamera-still` / `libcamera-vid` (Bullseye with libcamera-apps)
  - `raspistill` / `raspivid` (legacy camera stack)

## Setup

```bash
git clone <repo-url>
cd vogelhausPi
npm install
node app.js
```

The app runs on port **3000**. Open `http://<pi-ip>:3000` in a browser.

## Camera Backend Detection

At startup, the app checks which camera tools are available and logs the result:

```
[camera] Backend erkannt: rpicam (rpicam-still)
```

The detection order is:
1. `rpicam-still` → **rpicam** (Bookworm+, newest)
2. `libcamera-still` → **libcamera** (Bullseye)
3. `raspistill` → **legacy** (older Pi OS)

The correct CLI flags are built automatically for whichever backend is found — flag names differ between legacy (`-w/-h`, `-fps`, `-ISO`) and rpicam/libcamera (`--width/--height`, `--framerate`, `--gain`).

You can also see the detected backend on the `/Einstellungen` page.

## Settings

Camera settings are configured at `/Einstellungen` in the browser and saved to `config/settings.json` (excluded from git). On first run the defaults are used.

### Available settings

| Setting | Options | Default |
|---|---|---|
| Photo resolution | 1024×768, 1296×972, 1640×1232, 1920×1080, 2592×1944, 3280×2464 | 1024×768 |
| Photo format | PNG, JPEG | PNG |
| ISO | Auto, 100, 200, 400, 800 | 800 |
| Exposure mode | Auto, Sport, Night, Backlight, Very long, Anti-shake | Auto |
| Metering mode | Average, Spot, Backlit, Matrix | Average |
| White balance | Auto, Off (fixed gains) | Auto |
| EV correction | −10 … +10 | 0 |
| Video resolution | 640×480, 1024×768, 1280×720, 1296×972, 1920×1080 | 640×480 |
| Video duration | ms | 10 000 |
| Video FPS | — | 30 |
| Video bitrate | bit/s (0 = camera default) | 0 |
| h264→mp4 conversion | Copy (fast) / Re-encode (libx264) | Re-encode |

### Camera presets

The settings page offers one-click presets for two cameras, selectable via dropdown:

**NoIR Camera v2 (IMX219)** — recommended for the 8MP NoIR sensor on a Pi Zero WH:
- 1640×1232, JPEG, ISO auto, sports exposure, backlit metering, bitrate 1.5 Mbit/s, copy conversion

**Camera v1 (OV5647)** — recommended for the 5MP OV5647 sensor on a newer Pi:
- 1296×972 (native sensor mode), JPEG, ISO auto, sports exposure, average metering, bitrate 1.5 Mbit/s, copy conversion

## Project Structure

```
app.js                  Entry point, Express setup, cron job
middleware/
  appMain.js            All routes (/takePicture, /takeVideo, /Galerie, /Einstellungen, …)
config/
  settings.js           Camera backend detection, settings load/save, CLI arg builders
  settings.json         Saved settings (gitignored, created on first save)
views/
  Einstellungen.hbs     Settings page
  Galerie.hbs           Gallery page
  Start.hbs             Home page
  Image.hbs             Single image view
  pages/main.hbs        Layout template
static/
  css/style.css         Custom styles
  js/init.js            Materialize init
data/                   Captured photos and videos (gitignored)
log/                    Application logs (gitignored)
```

## Author

Hajo Meinert
