# ReKaption Railway Backend Engine 🚀

Dedicated, high-performance rendering and transcription backend for **ReKaption**, optimized for deployment on **Railway.app**.

## Features Included
- ⚡ **FastAPI Server**: Handles transcription, audio processing, and rendering APIs.
- 🎬 **Remotion Video Engine**: Multithreaded React-to-Video rendering with custom Arabic fonts (Thmanyah) & animated captions (Pop, Wave, Slide).
- 🎙️ **Faster-Whisper & Gemini Transcription**: Word-level timestamping and chunking.
- 📥 **Integrated YouTube Downloader**: Cookie-authenticated audio/video downloader using `yt-dlp` and `ffmpeg`.
- 🔐 **Environment-driven Secrets**: Secure configuration for API keys (`GROQ_API_KEY`, `GEMINI_API_KEY`, etc.).

---

## 🛠️ How to Deploy to Railway

### Option A: Via GitHub (Recommended)
1. **Push this folder to a GitHub repository**:
   You can push this `railway-backend` folder as its own GitHub repository (e.g. `rekaption-railway-backend`).
   ```bash
   cd railway-backend
   git init
   git add .
   git commit -m "Initial commit of ReKaption Railway backend"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/rekaption-railway-backend.git
   git push -u origin main
   ```

2. **Deploy on Railway**:
   - Go to [Railway.app](https://railway.app) and sign in.
   - Click **New Project** -> **Deploy from GitHub repo**.
   - Select your `rekaption-railway-backend` repository.
   - Railway will automatically detect the `Dockerfile`, build it, and launch the service.

3. **Set Environment Variables (API Keys)**:
   In Railway Dashboard -> Service -> **Variables**:
   - `GROQ_API_KEY` (Optional, for fast text correction)
   - `GEMINI_API_KEY` (Optional, for Gemini transcription)
   - `ELEVENLABS_API_KEY` (Optional)

4. **Generate Domain**:
   In Railway Dashboard -> Service -> **Networking** -> Click **Generate Domain**.
   You will receive a production URL such as:
   `https://rekaption-railway-backend-production.up.railway.app`

---

## 🔗 Connecting to Frontend (Netlify)

In your `netlify-deploy/app.js` file, update the `apiUrl` variable:
```javascript
let apiUrl = 'https://YOUR-RAILWAY-DOMAIN.up.railway.app';
```
Save and deploy to Netlify! All transcription and video rendering tasks will now run on Railway with maximum vCPU rendering speed!
