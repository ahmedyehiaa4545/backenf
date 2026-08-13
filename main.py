import os
import uuid
import shutil
import asyncio
import subprocess
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import torch
from faster_whisper import WhisperModel
from transcribe import chunk_words
from fastapi.staticfiles import StaticFiles
import sqlite3
from pydantic import BaseModel

app = FastAPI(title="ReKaption API", description="API for transcribing audio and rendering video with captions")

RENDER_TASKS = {}

# Enable CORS for frontend deployment (Netlify)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Copy Thmanyah fonts to public/fonts so Remotion staticFile() can find them
_base_dir = os.path.dirname(os.path.abspath(__file__))
_fonts_src = os.path.join(_base_dir, "netlify-deploy", "fonts")
_fonts_dst = os.path.join(_base_dir, "public", "fonts")
os.makedirs(_fonts_dst, exist_ok=True)
if os.path.exists(_fonts_src):
    for _fname in os.listdir(_fonts_src):
        _src_f = os.path.join(_fonts_src, _fname)
        _dst_f = os.path.join(_fonts_dst, _fname)
        if os.path.isfile(_src_f) and not os.path.exists(_dst_f):
            shutil.copy2(_src_f, _dst_f)
    print(f"✅ Thmanyah fonts copied to {_fonts_dst}")
else:
    print(f"⚠️ fonts source not found: {_fonts_src}")


# Global model variable for lazy loading
whisper_model = None

def get_whisper_model():
    global whisper_model
    if whisper_model is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        print(f"Loading faster-whisper model 'medium' on {device} ({compute_type})...")
        whisper_model = WhisperModel("medium", device=device, compute_type=compute_type)
    return whisper_model

def clean_temp_dir(path: str):
    """Clean up the temporary directory after sending the response"""
    if os.path.exists(path):
        try:
            shutil.rmtree(path)
            print(f"Cleaned up temp directory: {path}")
        except Exception as e:
            print(f"Error cleaning up {path}: {e}")

@app.get("/")
def read_root():
    return {"status": "running", "device": "cuda" if torch.cuda.is_available() else "cpu"}

import base64
import requests

# Helper: Format seconds into SRT timestamp (HH:MM:SS,mmm)
def format_srt_timestamp(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    milliseconds = int(round((seconds - int(seconds)) * 1000))
    if milliseconds >= 1000:
        secs += 1
        milliseconds -= 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"

# Helper: Extract a compact mono MP3 from any input media and encode to base64
async def extract_and_encode_audio(input_path: str, task_dir: str) -> tuple[str, str]:
    temp_audio_path = os.path.join(task_dir, "extracted_audio.mp3")
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-vn",
        "-ar", "16000",
        "-ac", "1",
        "-b:a", "64k",
        temp_audio_path
    ]
    
    process = await asyncio.create_subprocess_exec(
        *ffmpeg_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    await process.communicate()
    
    with open(temp_audio_path, "rb") as f:
        audio_data = base64.b64encode(f.read()).decode("utf-8")
        
    return audio_data, "mp3"

# Helper: Clean any markdown blocks from LLM response text
def clean_llm_srt(response_text: str) -> str:
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        first_newline = cleaned.find("\n")
        if first_newline != -1:
            cleaned = cleaned[first_newline:].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
    return cleaned

# Helper: Parse SRT timestamp to float seconds
def parse_srt_time(time_str: str) -> float:
    import re
    time_str = time_str.strip().replace(",", ".")
    parts = time_str.split(":")
    
    def extract_float(s: str) -> float:
        match = re.search(r"\d+(\.\d+)?", s)
        if match:
            return float(match.group(0))
        return 0.0

    if len(parts) == 3:
        hours = extract_float(parts[0])
        minutes = extract_float(parts[1])
        seconds = extract_float(parts[2])
    elif len(parts) == 2:
        hours = 0.0
        minutes = extract_float(parts[0])
        seconds = extract_float(parts[1])
    else:
        hours = 0.0
        minutes = 0.0
        seconds = extract_float(parts[0])
        
    return hours * 3600 + minutes * 60 + seconds

# Helper: Parse SRT format text into list of segment dicts
def parse_srt_content(srt_text: str) -> list[dict]:
    # Normalize line endings and split into lines
    lines = [line.strip() for line in srt_text.replace("\r\n", "\n").split("\n")]
    
    parsed_segments = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line:
            i += 1
            continue
            
        # Check if this line is a timestamp line (e.g. contains "-->")
        if "-->" in line:
            try:
                # We found a timestamp!
                start_str, end_str = line.split("-->")
                start = parse_srt_time(start_str)
                end = parse_srt_time(end_str)
                
                # The text is the lines that follow, until we see a number or another timestamp or empty line
                text_lines = []
                j = i + 1
                while j < len(lines):
                    next_line = lines[j]
                    if not next_line:
                        # Empty line, stop collecting text
                        j += 1
                        break
                    if "-->" in next_line:
                        # Another timestamp, stop collecting text
                        break
                    # If it's a number and the line after it is a timestamp, it's the next block's index, so stop collecting
                    if next_line.isdigit() and j + 1 < len(lines) and "-->" in lines[j + 1]:
                        break
                    
                    text_lines.append(next_line)
                    j += 1
                
                text = " ".join(text_lines)
                
                # Double-check that we don't accidentally include timestamps or indices in the text
                if text and "-->" not in text:
                    parsed_segments.append({
                        "start": start,
                        "end": end,
                        "text": text
                    })
                
                i = j
                continue
            except Exception as e:
                print(f"Error parsing SRT line {line}: {e}")
                i += 1
                continue
        i += 1
        
    return parsed_segments

def align_timestamps(orig_words: list[dict], corr_word_texts: list[str]) -> list[dict]:
    import difflib
    
    def clean_for_match(text: str) -> str:
        if not text:
            return ""
        # Remove common punctuation
        for char in ['.', '?', '!', '،', '؟', ',', ';', '؛', ':', '-']:
            text = text.replace(char, '')
        return text.strip().lower()

    orig_clean = [clean_for_match(w["word"]) for w in orig_words]
    corr_clean = [clean_for_match(w) for w in corr_word_texts]
    
    matcher = difflib.SequenceMatcher(None, orig_clean, corr_clean)
    opcodes = matcher.get_opcodes()
    
    aligned_words = [None] * len(corr_word_texts)
    
    for tag, i1, i2, j1, j2 in opcodes:
        if tag == 'equal':
            # 1-to-1 mapping for exact or close matches
            for idx in range(j2 - j1):
                orig_idx = i1 + idx
                corr_idx = j1 + idx
                aligned_words[corr_idx] = {
                    "word": corr_word_texts[corr_idx],
                    "start": orig_words[orig_idx]["start"],
                    "end": orig_words[orig_idx]["end"]
                }
        elif tag == 'replace':
            # Localized replacement: interpolate orig_words[i1:i2] times over corr_word_texts[j1:j2]
            orig_sub = orig_words[i1:i2]
            corr_sub_len = j2 - j1
            
            start_time = orig_sub[0]["start"]
            end_time = orig_sub[-1]["end"]
            duration = end_time - start_time
            
            for idx in range(corr_sub_len):
                corr_idx = j1 + idx
                w_start = start_time + idx * (duration / corr_sub_len)
                w_end = start_time + (idx + 1) * (duration / corr_sub_len)
                aligned_words[corr_idx] = {
                    "word": corr_word_texts[corr_idx],
                    "start": round(w_start, 3),
                    "end": round(w_end, 3)
                }
        elif tag == 'insert':
            # Words were inserted. Find surrounding timestamps to interpolate locally.
            prev_end = None
            if j1 > 0 and aligned_words[j1 - 1] is not None:
                prev_end = aligned_words[j1 - 1]["end"]
            elif i1 > 0 and i1 - 1 < len(orig_words):
                prev_end = orig_words[i1 - 1]["end"]
                
            next_start = None
            if i2 < len(orig_words):
                next_start = orig_words[i2]["start"]
                
            # Fallbacks if we are at boundaries
            if prev_end is None and next_start is not None:
                prev_end = max(0.0, next_start - 1.0)
            elif next_start is None and prev_end is not None:
                next_start = prev_end + 1.0
            elif prev_end is None and next_start is None:
                prev_end = 0.0
                next_start = 1.0
                
            duration = next_start - prev_end
            corr_sub_len = j2 - j1
            for idx in range(corr_sub_len):
                corr_idx = j1 + idx
                w_start = prev_end + idx * (duration / corr_sub_len)
                w_end = prev_end + (idx + 1) * (duration / corr_sub_len)
                aligned_words[corr_idx] = {
                    "word": corr_word_texts[corr_idx],
                    "start": round(w_start, 3),
                    "end": round(w_end, 3)
                }
        # 'delete' tag requires no action since those words are omitted from corr_word_texts
        
    # Fill any remaining None values just in case
    for idx, w in enumerate(aligned_words):
        if w is None:
            prev_end = aligned_words[idx - 1]["end"] if idx > 0 and aligned_words[idx - 1] is not None else 0.0
            aligned_words[idx] = {
                "word": corr_word_texts[idx],
                "start": prev_end,
                "end": prev_end + 0.3
            }
            
    return aligned_words

# Helper: Synchronous OpenRouter POST request to run in separate thread executor
def call_openrouter_sync(payload: dict, headers: dict) -> dict:
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        json=payload,
        headers=headers,
        timeout=60
    )
    response.raise_for_status()
    return response.json()

from pydantic import BaseModel

class RenderRequest(BaseModel):
    audioPath: str
    videoPath: str | None = None
    durationInSeconds: float
    segments: list[dict]
    animationType: str = "classic"
    activeColor: str | None = "#FFFFFF"
    inactiveColor: str | None = "#FFFFFF"
    leftLogo: str | None = None
    rightLogo: str | None = None
    fontSize: int = 50
    bgColor: str = "#000000"
    bgOpacity: float = 0.86
    syncOffset: float = 0.20
    wordSpacing: int = 31
    bgPadding: int = 8
    showBg: bool = True
    captionTop: int = 65
    fontFamily: str | None = "thmanyah"
    customFontName: str | None = None
    customFontBase64: str | None = None
    strokeColor: str | None = "#000000"
    strokeWidth: int | None = 0
    shadowColor: str | None = "#000000"
    shadowBlur: int | None = 0
    showTitle: bool = True
    titleText: str | None = ""
    titleSubtext: str | None = ""
    titleColor: str | None = "#FFFFFF"
    titleBgColor: str | None = "#000000"
    titleDuration: float = 3.0
    titleTop: float = 12.0
    titleStyle: str = "tiktok-pill"

def download_audio_via_rapidapi(youtube_url: str, output_path: str) -> str:
    import re
    import time
    import requests
    import os
    pattern = r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})'
    match = re.search(pattern, youtube_url)
    if not match:
        raise Exception("Invalid YouTube URL")
    video_id = match.group(1)
    
    RAPID_API_KEY = os.environ.get("RAPID_API_KEY", "78aaeed1d3mshdc777f49020e221p1803c4jsn35138c026a86")
    headers = {
        'x-rapidapi-host': 'youtube-mp4-mp3-downloader.p.rapidapi.com',
        'x-rapidapi-key': RAPID_API_KEY,
        'Content-Type': 'application/json'
    }
    
    print(f"[*] Fetching audio via RapidAPI fallback for video ID: {video_id}...")
    api_url = "https://youtube-mp4-mp3-downloader.p.rapidapi.com/api/v1/download"
    params = {
        'format': 'mp3',
        'id': video_id,
        'audioQuality': '128',
        'allowExtendedDuration': 'true'
    }
    
    res = requests.get(api_url, headers=headers, params=params, timeout=15)
    if res.status_code != 200:
        raise Exception(f"RapidAPI start failed with status {res.status_code}")
        
    res_data = res.json()
    rapid_task_id = res_data.get('progressId') or res_data.get('id')
    if not rapid_task_id:
        raise Exception("RapidAPI task ID not found")
        
    progress_url = "https://youtube-mp4-mp3-downloader.p.rapidapi.com/api/v1/progress"
    download_url = None
    for attempt in range(25):
        try:
            p_res = requests.get(progress_url, headers=headers, params={'id': rapid_task_id}, timeout=10)
            if p_res.status_code == 200:
                p_data = p_res.json()
                if p_data.get('finished') is True or p_data.get('status') == 'Finished':
                    download_url = p_data.get('downloadUrl')
                    print("🎉 RapidAPI conversion completed successfully!")
                    break
        except Exception:
            pass
        time.sleep(2)
        
    if not download_url:
        raise Exception("RapidAPI conversion timeout")
        
    audio_res = requests.get(download_url, stream=True, timeout=60)
    if audio_res.status_code != 200:
        raise Exception("Failed to fetch MP3 stream from RapidAPI")
        
    with open(output_path, 'wb') as f:
        for chunk in audio_res.iter_content(chunk_size=1024*1024):
            if chunk:
                f.write(chunk)
                
    return output_path

def download_youtube_audio_server(youtube_url: str, task_dir: str) -> str:
    import yt_dlp
    import glob
    import os
    
    print("[*] جاري تحميل الصوت من يوتيوب...")
    output_filename = os.path.join(task_dir, "audio")
    
    impersonate_obj = None
    try:
        from yt_dlp.networking.impersonate import ImpersonateTarget
        impersonate_obj = ImpersonateTarget.from_str("chrome")
    except Exception as e:
        pass

    cookies_path = None
    for candidate in ["cookies.txt", "coolies2.txt", "cookies2.txt", "www.youtube.com_cookies (1).txt"]:
        if os.path.exists(candidate):
            cookies_path = candidate
            break

    attempts = []
    
    # Attempt 1 (Bulletproof): Android VR Player Client
    opts_vr = {
        "format": "bestaudio/best",
        "outtmpl": output_filename,
        "extractor_args": {"youtube": {"player_client": ["android_vr", "ios", "mweb"]}},
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
        "quiet": True,
        "noprogress": True,
    }
    if cookies_path and os.path.exists(cookies_path):
        opts_vr["cookiefile"] = cookies_path
    attempts.append({"name": "Android VR Client", "opts": opts_vr})

    # Attempt 2: With cookies + Chrome Impersonation
    if cookies_path and os.path.exists(cookies_path):
        opts_cookies = {
            "format": "bestaudio/best",
            "outtmpl": output_filename,
            "cookiefile": cookies_path,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
            "quiet": True,
            "noprogress": True,
        }
        if impersonate_obj is not None:
            opts_cookies["impersonate"] = impersonate_obj
        attempts.append({"name": f"With cookies ({os.path.basename(cookies_path)})", "opts": opts_cookies})

    last_err = None
    for i, attempt in enumerate(attempts, 1):
        print(f"[{task_dir}] Running Attempt {i}/{len(attempts)}: {attempt['name']}...")
        try:
            with yt_dlp.YoutubeDL(attempt["opts"]) as ydl:
                ydl.download([youtube_url])
            audio_path = output_filename + ".mp3"
            if os.path.exists(audio_path) and os.path.getsize(audio_path) > 0:
                print(f"[+] Success on Attempt {i}: {audio_path}")
                return audio_path
        except Exception as e:
            last_err = e
            print(f"[{task_dir}] Attempt {i} failed: {e}")

    # Fallback to RapidAPI conversion if yt-dlp attempts failed or got blocked
    print(f"[{task_dir}] Direct yt-dlp attempts failed. Falling back to RapidAPI converter...")
    try:
        audio_mp3_path = output_filename + ".mp3"
        return download_audio_via_rapidapi(youtube_url, audio_mp3_path)
    except Exception as r_err:
        print(f"[{task_dir}] RapidAPI fallback error: {r_err}")

    mp3_files = glob.glob(os.path.join(task_dir, "*.mp3"))
    if mp3_files:
        return mp3_files[0]
        
    if last_err:
        raise last_err
    raise Exception("Failed to download or convert YouTube audio.")

def download_youtube_video_and_audio(youtube_url: str, task_dir: str) -> tuple[str, str | None]:
    import yt_dlp
    import glob
    import subprocess
    import os
    
    print(f"[{task_dir}] Downloading YouTube video & audio for URL: {youtube_url}")
    video_path = os.path.join(task_dir, "video.mp4")
    audio_path = os.path.join(task_dir, "audio.mp3")
    
    cookies_path = None
    for candidate in ["coolies2.txt", "cookies2.txt", "www.youtube.com_cookies (1).txt"]:
        if os.path.exists(candidate):
            cookies_path = candidate
            break

    ydl_opts = {
        "format": "bestvideo[height<=1080]+bestaudio/bestvideo[height<=1080]/bestvideo+bestaudio/best",
        "outtmpl": video_path,
        "quiet": True,
        "noprogress": True,
        "merge_output_format": "mp4",
    }
    if cookies_path:
        ydl_opts["cookiefile"] = cookies_path

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([youtube_url])
        if os.path.exists(video_path):
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "libmp3lame", "-ab", "128k", audio_path],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=True
                )
                if os.path.exists(audio_path):
                    task_folder_name = os.path.basename(task_dir)
                    print(f"[{task_dir}] Successfully downloaded video and extracted audio.")
                    return audio_path, f"{task_folder_name}/video.mp4"
            except Exception as e:
                print(f"[{task_dir}] ffmpeg audio extraction error: {e}")
    except Exception as err:
        print(f"[{task_dir}] Video download fallback to audio-only: {err}")

    audio_only_path = download_youtube_audio_server(youtube_url, task_dir)
    return audio_only_path, None


        
@app.get("/api/debug")
def debug_endpoint():
    import sys
    import traceback
    
    debug_info = {}
    debug_info["python_version"] = sys.version
    
    # Check curl_cffi import
    try:
        import curl_cffi
        debug_info["curl_cffi_imported"] = True
        debug_info["curl_cffi_version"] = getattr(curl_cffi, "__version__", "unknown")
    except Exception as e:
        debug_info["curl_cffi_imported"] = False
        debug_info["curl_cffi_error"] = str(e)
        debug_info["curl_cffi_traceback"] = traceback.format_exc()
        
    # Check yt_dlp import and targets
    try:
        import yt_dlp
        debug_info["yt_dlp_version"] = getattr(yt_dlp.version, "__version__", "unknown")
        try:
            ydl = yt_dlp.YoutubeDL()
            debug_info["yt_dlp_impersonate_targets"] = list(ydl.list_impersonate_targets().keys()) if hasattr(ydl, "list_impersonate_targets") else []
        except Exception as ey:
            debug_info["yt_dlp_impersonate_error"] = str(ey)
    except Exception as e:
        debug_info["yt_dlp_error"] = str(e)
        
    return debug_info

async def transcribe_with_groq_whisper(
    audio_path: str,
    groq_api_key: str,
    min_words: int = 3,
    max_words: int = 6,
    openrouter_key: str = None,
    gemini_key: str = None,
    skip_correction: bool = False
) -> tuple[list[dict], float, str, str, str, str]:
    """
    Transcribes audio using Groq's whisper-large-v3-turbo API with word-level timestamps,
    and applies AI smart phrase splitting & audio-based correction with Gemini/OpenRouter.
    """
    print(f"⚡ Transcribing with Groq whisper-large-v3-turbo...")
    import re
    import time
    import requests
    
    words_data = []
    duration = 0.0
    
    try:
        try:
            from groq import Groq
            client = Groq(api_key=groq_api_key)
            with open(audio_path, "rb") as file:
                res = client.audio.transcriptions.create(
                    file=(os.path.basename(audio_path), file.read()),
                    model="whisper-large-v3-turbo",
                    response_format="verbose_json",
                    timestamp_granularities=["word"],
                )
                res_dict = res.to_dict() if hasattr(res, "to_dict") else dict(res)
        except Exception as groq_sdk_err:
            print(f"Groq SDK fallback to direct REST API: {groq_sdk_err}")
            headers = {"Authorization": f"Bearer {groq_api_key}"}
            with open(audio_path, "rb") as file:
                files = {"file": (os.path.basename(audio_path), file, "audio/mpeg")}
                data = {
                    "model": "whisper-large-v3-turbo",
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "word"
                }
                resp = requests.post("https://api.groq.com/openai/v1/audio/transcriptions", headers=headers, files=files, data=data, timeout=120)
                resp.raise_for_status()
                res_dict = resp.json()

        raw_words = res_dict.get("words", [])
        duration = float(res_dict.get("duration", 0.0))

        for w in raw_words:
            cw = re.sub(r"\s+", " ", w.get("word", "")).strip()
            if cw:
                words_data.append({
                    "word": cw,
                    "clean_word": cw,
                    "start": round(float(w.get("start", 0.0)), 3),
                    "end": round(float(w.get("end", 0.0)), 3)
                })
    except Exception as e:
        print(f"❌ Error during Groq transcription: {e}")
        raise e

    if not words_data:
        raise Exception("Groq transcription returned no words.")

    if duration <= 0 and words_data:
        duration = words_data[-1]["end"]

    original_text = " ".join(w["clean_word"] for w in words_data)
    print(f"✅ Groq extracted {len(words_data)} words. Text length: {len(original_text)} chars.")

    # 2. AI Smart Processing with google/gemini-2.5-pro-preview-05-06 (Audio-Listening Mode)
    effective_api_key = openrouter_key or gemini_key or os.environ.get("OPENROUTER_API_KEY") or os.environ.get("GEMINI_API_KEY")
    
    if effective_api_key and not skip_correction:
        headers = {
            "Authorization": f"Bearer {effective_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://rekaption.hf.space/",
            "X-Title": "ReKaption Subtitle Processor"
        }

        # MODE A: Multimodal Audio Listening & Speech Correction
        try:
            print("🎧 Running google/gemini-2.5-pro-preview-05-06 WITH AUDIO LISTENING...")
            import base64
            with open(audio_path, "rb") as f_aud:
                audio_b64 = base64.b64encode(f_aud.read()).decode("utf-8")

            prompt_audio = f"""أنت خبير محترف في التدقيق اللغوي للترجمات وتقسيمها (Subtitles).
قم بالاستماع بتركيز شديد للملف الصوتي المرفق، وراجع النص أدناه:

مهمتك الرئيسية:
1. استمع للصوت المرفق، وقم بتصحيح أي كلمة مفرغة ليكون النص مطابقاً تماماً لنطق الصوت المسموع دون تغيير لهجة المتحدث (مثال: 'من هالعائلة' اتركها بنطقها المسموع ولا تحولها لفصحى مثل 'من هذه العائلة').
2. احذف فوراً أي كلمات غير مكتملة أو تأتأة أو مقاطع مكررة أو شرطات مكسورة (مثل 'اااا'، 'الـ'، 'ال ال'، 'في ال في ال'، 'لـ'، والشرطات '--').
3. أدخل علامة "|" لتقسيم الكلمات إلى مقاطع سياقية قصيرة (من {min_words} إلى {max_words} كلمات كحد أقصى لكل مقطع).
4. أخرج النص المصلح والمقسم فقط في سطر واحد مفصولاً بعلامات "|".

النص المفرغ المبدئي:
{original_text}"""

            req_data_audio = {
                "model": "google/gemini-2.5-pro-preview-05-06",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt_audio},
                            {"type": "input_audio", "input_audio": {"data": audio_b64, "format": "mp3"}}
                        ]
                    }
                ],
                "temperature": 0.1
            }

            target_model = "google/gemini-2.5-pro-preview-05-06"
            req_data_audio["model"] = target_model
            max_attempts = 4
            for attempt in range(1, max_attempts + 1):
                try:
                    print(f"🎧 OpenRouter Audio Listening attempt {attempt}/{max_attempts} with model {target_model}...")
                    resp_aud = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=req_data_audio, timeout=120)
                    if resp_aud.status_code == 200:
                        content = resp_aud.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                        if content and content.strip():
                            audio_corrected_output = content.strip()
                            audio_corrected_output = re.sub(r"\|+", "|", audio_corrected_output.replace("\r", "|").replace("\n", "|")).strip("| ")
                            print(f"✅ Audio Listening output generated with {target_model} on attempt {attempt} ({len(audio_corrected_output)} chars).")
                            break
                        else:
                            print(f"⚠️ OpenRouter returned empty content on attempt {attempt}/{max_attempts} for model {target_model}. Retrying same model...")
                except Exception as e_m:
                    print(f"⚠️ OpenRouter request error on attempt {attempt}/{max_attempts} for model {target_model}: {e_m}")
                time.sleep(1.5)
        except Exception as e_aud:
            print(f"⚠️ Audio listening mode warning: {e_aud}")

        # MODE B: Text-Only Phrase Splitting (without audio)
        try:
            print("📝 Running google/gemini-2.5-pro-preview-05-06 TEXT-ONLY...")
            prompt_text = f"""أنت خبير في تقسيم السبترايتل. مهمتك الوحيدة: إدراج علامة "|" داخل النص لتقسيمه إلى مقاطع من {min_words} إلى {max_words} كلمات بالمعنى. ممنوع تغيير أو تعديل أي كلمة:
{original_text}"""

            req_data_text = {
                "model": "google/gemini-2.5-pro-preview-05-06",
                "messages": [{"role": "user", "content": prompt_text}],
                "temperature": 0.1
            }

            resp_txt = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=req_data_text, timeout=60)
            if resp_txt.status_code == 200:
                text_only_output = resp_txt.json()["choices"][0]["message"]["content"].strip()
                text_only_output = re.sub(r"\|+", "|", text_only_output.replace("\r", "|").replace("\n", "|")).strip("| ")
                print(f"✅ Text-Only output generated ({len(text_only_output)} chars).")
        except Exception as e_txt:
            print(f"⚠️ Text-only mode warning: {e_txt}")

    # Determine segment counts and apply Gemini Audio Listening corrected words to subtitles
    segment_counts = []
    
    # Priority 1: Use Mode 3 Gemini Audio Listening & Speech Correction
    if audio_corrected_output:
        llm_words = [w for w in re.split(r"[|\s]+", audio_corrected_output) if w]
        if len(llm_words) == len(words_data):
            print("✨ Applying Gemini Audio Listening corrected words & speech boundaries to video subtitles...")
            for i in range(len(words_data)):
                words_data[i]["clean_word"] = llm_words[i]
            segment_counts = [len(seg.split()) for seg in audio_corrected_output.split("|") if seg.strip()]
        else:
            print(f"ℹ️ Gemini Audio Listening modified phrase structure ({len(llm_words)} vs {len(words_data)} words).")
            segment_counts = [len(seg.split()) for seg in audio_corrected_output.split("|") if seg.strip()]

    # Priority 2: Text-Only Gemini fallback
    if not segment_counts and text_only_output:
        llm_words = [w for w in re.split(r"[|\s]+", text_only_output) if w]
        if len(llm_words) == len(words_data):
            print("✨ Applying Text-Only Gemini phrase boundaries to video subtitles...")
            segment_counts = [len(seg.split()) for seg in text_only_output.split("|") if seg.strip()]



    # 3. Group words into chunks
    word_chunks = []
    word_index = 0
    for count in segment_counts:
        while count > 0 and word_index < len(words_data):
            take = min(count, max_words)
            chunk = words_data[word_index:word_index + take]
            word_chunks.append(chunk)
            word_index += take
            count -= take

    while word_index < len(words_data):
        word_chunks.append(words_data[word_index:word_index + max_words])
        word_index += max_words

    # 4. Build subtitle segments with exact Whisper timestamps aligned to Gemini Audio Listening text
    MIN_DURATION = 0.5
    subtitles = []
    import difflib

    target_output = audio_corrected_output or text_only_output
    if target_output:
        phrases = [p.strip() for p in target_output.split("|") if p.strip()]
        
        gemini_words = []
        phrase_word_map = []
        for p_idx, phrase in enumerate(phrases):
            p_w = phrase.split()
            for w in p_w:
                gemini_words.append(w)
                phrase_word_map.append(p_idx)
                
        groq_words = [w["clean_word"] for w in words_data]
        
        if gemini_words and groq_words:
            print("🎯 Aligning Gemini Audio Listening words with Groq exact timestamps...")
            matcher = difflib.SequenceMatcher(None, groq_words, gemini_words)
            aligned_timestamps = [None] * len(gemini_words)
            
            for g_idx, j_idx, length in matcher.get_matching_blocks():
                for k in range(length):
                    w_item = words_data[g_idx + k]
                    aligned_timestamps[j_idx + k] = {
                        "start": w_item["start"],
                        "end": w_item["end"]
                    }
                    
            last_end = words_data[0]["start"]
            for i in range(len(gemini_words)):
                if aligned_timestamps[i] is None:
                    next_start = None
                    for j in range(i + 1, len(gemini_words)):
                        if aligned_timestamps[j] is not None:
                            next_start = aligned_timestamps[j]["start"]
                            break
                    if next_start is None:
                        next_start = words_data[-1]["end"]
                    
                    w_start = max(last_end, round(last_end + 0.05, 3))
                    w_end = min(next_start, round(w_start + 0.3, 3))
                    aligned_timestamps[i] = {"start": w_start, "end": w_end}
                last_end = aligned_timestamps[i]["end"]
                
            current_p_idx = -1
            current_phrase_words = []
            
            for i in range(len(gemini_words)):
                p_idx = phrase_word_map[i]
                w_obj = {
                    "word": gemini_words[i],
                    "start": aligned_timestamps[i]["start"],
                    "end": aligned_timestamps[i]["end"]
                }
                
                if p_idx != current_p_idx:
                    if current_phrase_words:
                        phrase_text = phrases[current_p_idx]
                        subtitles.append({
                            "start": current_phrase_words[0]["start"],
                            "end": current_phrase_words[-1]["end"],
                            "text": phrase_text,
                            "words": current_phrase_words
                        })
                    current_p_idx = p_idx
                    current_phrase_words = [w_obj]
                else:
                    current_phrase_words.append(w_obj)
                    
            if current_phrase_words and current_p_idx >= 0:
                phrase_text = phrases[current_p_idx]
                subtitles.append({
                    "start": current_phrase_words[0]["start"],
                    "end": current_phrase_words[-1]["end"],
                    "text": phrase_text,
                    "words": current_phrase_words
                })


    # Fallback to Groq chunking if Gemini output building was skipped
    if not subtitles:
        word_chunks = []
        word_index = 0
        while word_index < len(words_data):
            word_chunks.append(words_data[word_index:word_index + max_words])
            word_index += max_words

        for chunk in word_chunks:
            word_list = []
            for w in chunk:
                word_list.append({
                    "word": w["clean_word"],
                    "start": w["start"],
                    "end": w["end"]
                })
            subtitles.append({
                "start": chunk[0]["start"],
                "end": chunk[-1]["end"],
                "text": " ".join(w["clean_word"] for w in chunk),
                "words": word_list
            })

    # Ensure monotonic start times
    for i in range(1, len(subtitles)):
        if subtitles[i]["start"] < subtitles[i - 1]["start"] + MIN_DURATION:
            subtitles[i]["start"] = round(subtitles[i - 1]["start"] + MIN_DURATION, 3)

    # Weld end times so there are no gap/overlap glitches
    for i in range(len(subtitles) - 1):
        subtitles[i]["end"] = subtitles[i + 1]["start"]

    if subtitles:
        last = subtitles[-1]
        if last["end"] < last["start"] + MIN_DURATION:
            last["end"] = round(last["start"] + MIN_DURATION, 3)

    # Also generate raw uncorrected subtitles for side-by-side comparison
    raw_subtitles = []
    r_index = 0
    while r_index < len(words_data):
        r_chunk = words_data[r_index:r_index + max_words]
        r_word_list = [{"word": w["clean_word"], "start": w["start"], "end": w["end"]} for w in r_chunk]
        raw_subtitles.append({
            "start": r_chunk[0]["start"],
            "end": r_chunk[-1]["end"],
            "text": " ".join(w["clean_word"] for w in r_chunk),
            "words": r_word_list
        })
        r_index += max_words

    print(f"🎉 Generated {len(subtitles)} welded subtitle chunks via Gemini Audio Listening!")
    return subtitles, duration, original_text, raw_subtitles, text_only_output, audio_corrected_output

def call_elevenlabs_scribe_sync(audio_path: str, api_key: str) -> dict:
    import requests
    import os
    url = "https://api.elevenlabs.io/v1/speech-to-text"
    headers = {
        "xi-api-key": api_key
    }
    with open(audio_path, "rb") as f:
        files = {
            "file": ("input_audio.mp3", f, "audio/mpeg")
        }
        data = {
            "model_id": "scribe_v2",
            "language_code": "ara",
            "timestamps_granularity": "word",
            "diarize": "false"
        }
        response = requests.post(url, headers=headers, files=files, data=data, timeout=180)
        response.raise_for_status()
        return response.json()

async def correct_scribe_with_gemini(
    audio_path: str,
    audio_ext: str,
    chunks: list[dict],
    openrouter_key: str,
    model_name: str = "google/gemini-2.5-pro-preview-05-06"
) -> tuple[list[dict], str]:
    if not openrouter_key or not openrouter_key.strip():
        orig_t = "\n".join(c["text"] for c in chunks)
        return chunks, orig_t

    import base64
    import requests
    import copy
    import re
    import asyncio
    import os
    import time
    import subprocess

    target_model = (model_name or "").strip() or "google/gemini-2.5-pro-preview-05-06"

    # Prepare high-quality volume-boosted audio (+10dB gain boost, 44.1kHz 192k MP3) for OpenRouter
    boosted_audio_path = os.path.join(os.path.dirname(audio_path), f"temp_boosted_{int(time.time())}.mp3")
    target_file_to_read = audio_path
    aud_fmt = "mp3"
    ext_lower = audio_ext.lower()
    if ext_lower in [".wav"]: aud_fmt = "wav"
    elif ext_lower in [".m4a"]: aud_fmt = "m4a"
    elif ext_lower in [".ogg"]: aud_fmt = "ogg"

    try:
        boost_cmd = [
            "ffmpeg", "-y", "-i", audio_path,
            "-filter:a", "volume=10dB",
            "-ac", "1",
            "-ar", "16000",
            "-b:a", "32k",
            boosted_audio_path
        ]
        subprocess.run(boost_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        target_file_to_read = boosted_audio_path
        aud_fmt = "mp3"
        print("🔊 Generated ultra-lightweight +10dB boosted 16kHz mono audio for OpenRouter Gemini listening.")
    except Exception as e_boost:
        print(f"⚠️ Audio volume boosting warning ({e_boost}). Using original audio.")
        target_file_to_read = audio_path

    try:
        with open(target_file_to_read, "rb") as f_aud:
            audio_b64 = base64.b64encode(f_aud.read()).decode("utf-8")
    finally:
        if target_file_to_read != audio_path and os.path.exists(target_file_to_read):
            try:
                os.remove(target_file_to_read)
            except Exception:
                pass

    formatted_scribe_text = "\n".join(seg["text"] for seg in chunks)

    prompt_audio = f"""أنت خبير محترف في التدقيق اللغوي للترجمات والاستماع الصوتي.
مهمتك هي تصحيح النص المفرغ بناءً على ما تسمعه في الملف الصوتي المرفق، مع الالتزام التام بالقواعد التالية:

1. الأولوية للصوت المسموع: صحح الكلمات تماماً كما نُطقت (حتى لو كانت بالعامية). لا تغير اللهجة ولا تحولها لفصحى (مثال: 'من هالعائلة' تبقى كما هي).
2. المطابقة التامة لعدد الأسطر: يجب أن يكون عدد الأسطر في النص المصحح مطابقاً تماماً للنص الأصلي المدخل. ممنوع منعاً باتاً دمج الأسطر أو تقسيمها أو تغيير عددها أو توقيتاتها! كل سطر في النص المدخل يقابله سطر واحد في التصحيح.
3. التنوين: إذا سمعت تنويناً، اكتبه فقط إذا كان "تنوين ألف" (تنوين فتح) مثل: (أهلاً، حقاً، جداً). لا تكتب حرف النون في نهاية الكلمات المنونة! 
4. علامات الترقيم: قم بإزالة تماماً وكلياً كافة علامات الترقيم من نهايات الأسطر والجمل (مثل: . ! ، : ؛ - إلخ). واحتفظ فقط وحصرياً بعلامة الاستفهام (؟) في نهاية السطر إذا كان السطر سؤالاً.
5. الهمزات: صحح همزات الوصل والقطع إذا تطلب الأمر. (هذي تبقى هذه، فيه تبقى في، كذا تبقى كدا).
6. التنظيف: احذف أي تأتأة أو كلمات غير مكتملة أو تكرار مثل (اااا، الـ، ال ال، في ال في ال) وأي شرطات (--) في نهايات السطور.
7. الأرقام: اكتب التواريخ والأرقام حسابياً وليس بالحروف (مثال: 2024 وليس ألفين وأربعة وعشرين).
8. الإخراج: أخرج النص المصحح فقط داخل كود بلوك ```، بحيث يكون كل سطر مستقلاً وبنفس ترتيب المدخلات.

النص المفرغ من ElevenLabs Scribe (يرجى إدراج التصحيح النهائي داخل كود بلوك ``` بنفس عدد الأسطر بالضبط وكل سطر في سطر مستقل):
{formatted_scribe_text}"""

    headers = {
        "Authorization": f"Bearer {openrouter_key.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://rekaption.com",
        "X-Title": "ReKaption"
    }

    req_data_audio = {
        "model": target_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt_audio},
                    {"type": "input_audio", "input_audio": {"data": audio_b64, "format": aud_fmt}}
                ]
            }
        ],
        "temperature": 0.1
    }

    def _call_or():
        req_data_audio["model"] = target_model
        max_attempts = 4
        for attempt in range(1, max_attempts + 1):
            try:
                print(f"🎧 Sending Audio Listening Correction to OpenRouter with model {target_model} (Attempt {attempt}/{max_attempts})...")
                res = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=req_data_audio, timeout=120)
                res.raise_for_status()
                data = res.json()
                choices = data.get("choices", [])
                if choices:
                    msg = choices[0].get("message", {})
                    content = msg.get("content")
                    if content and content.strip():
                        print(f"✨ Successfully retrieved content using {target_model} on attempt {attempt}")
                        return data
                    else:
                        finish_reason = choices[0].get("finish_reason", "empty")
                        print(f"⚠️ OpenRouter returned empty content on attempt {attempt}/{max_attempts} with model {target_model} (finish_reason: {finish_reason}). Retrying same model...")
                else:
                    print(f"⚠️ OpenRouter returned no choices on attempt {attempt}/{max_attempts} with model {target_model}. Retrying same model...")
            except Exception as e_or:
                print(f"⚠️ OpenRouter request warning on attempt {attempt}/{max_attempts} ({target_model}): {e_or}")
            time.sleep(1.5)
        return {}

    print(f"🎧 Sending Audio Listening Correction to OpenRouter with model: {target_model}...")
    resp_json = await asyncio.to_thread(_call_or)
    
    msg_content = resp_json.get("choices", [{}])[0].get("message", {}).get("content")
    if not msg_content:
        print(f"⚠️ OpenRouter returned empty content after retries. Falling back to uncorrected Scribe text.")
        return chunks, formatted_scribe_text
    
    raw_content = msg_content.strip()

    cb_match = re.search(r"```(?:text|json|arabic|ar)?\s*([\s\S]*?)```", raw_content)
    corrected_str = cb_match.group(1).strip() if cb_match else raw_content

    corrected_lines = [l.strip() for l in corrected_str.splitlines() if l.strip()]
    corrected_chunks = copy.deepcopy(chunks)

    import difflib

    scribe_line_texts = [c["text"].strip() for c in chunks]
    aligned_gemini_lines = [None] * len(chunks)

    if len(corrected_lines) == len(corrected_chunks):
        print(f"✨ Applying {target_model} audio correction to {len(corrected_chunks)} Scribe segments (exact line match)...")
        aligned_gemini_lines = corrected_lines
    else:
        print(f"✨ Line count mismatch ({len(corrected_lines)} vs {len(corrected_chunks)}). Aligning Gemini corrections per segment while preserving 100% Scribe timing anchors...")
        matcher = difflib.SequenceMatcher(None, scribe_line_texts, corrected_lines)
        for block in matcher.get_matching_blocks():
            for k in range(block.size):
                if block.a + k < len(aligned_gemini_lines):
                    aligned_gemini_lines[block.a + k] = corrected_lines[block.b + k]

    for i in range(len(corrected_chunks)):
        target_line = aligned_gemini_lines[i] or scribe_line_texts[i]
        clean_new_line = re.sub(r"[^\w\s\?؟]+$", "", target_line.strip())
        corrected_chunks[i]["text"] = clean_new_line
        
        new_words = clean_new_line.split()
        old_words = corrected_chunks[i].get("words", [])
        
        if len(new_words) == len(old_words):
            # Preserve Scribe's EXACT word-level start & end timestamps 100%
            for k in range(len(new_words)):
                old_words[k]["word"] = new_words[k]
            corrected_chunks[i]["words"] = old_words
        else:
            # Re-distribute words strictly within segment i's start & end time anchors
            c_start = corrected_chunks[i]["start"]
            c_end = corrected_chunks[i]["end"]
            dur = max(0.1, c_end - c_start)
            step = dur / max(1, len(new_words))
            corrected_chunks[i]["words"] = [
                {
                    "word": w,
                    "start": round(c_start + k * step, 3),
                    "end": round(c_start + (k + 1) * step, 3)
                }
                for k, w in enumerate(new_words)
            ]

    audio_corrected_text_result = "\n".join(c["text"] for c in corrected_chunks)
    return corrected_chunks, audio_corrected_text_result

def process_scribe_words(
    words: list[dict],
    min_words: int = 2,
    max_words: int = 5,
    pause_threshold: float = 0.6,
    gap_bridge_limit: float = 0.35,
    global_offset: float = -0.10
) -> list[dict]:
    # --- Step 1: clean words (keep RAW times, same as Colab) ---
    clean_words = []
    for w in words:
        if w.get("type", "word") == "word":
            clean_words.append({
                "word": w["text"],
                "start": w["start"],   # raw, no offset yet
                "end":   w["end"]      # raw, no offset yet
            })

    if not clean_words:
        return []

    terminal_punct = (".", "!", "؟", "?", "...", "،،")
    soft_punct     = ("،", ",", ":", "؛", ";", "-", "—")

    def ends_with_any(text: str, chars) -> bool:
        return any(text.strip().endswith(c) for c in chars)

    def apply_offset(seconds: float) -> float:
        """Mirror Colab's apply_offset exactly."""
        return max(0.0, seconds + global_offset)

    # --- Step 2: split into lines (using RAW times for gap, same as Colab) ---
    lines = []
    current_line = []

    for i, w in enumerate(clean_words):
        current_line.append(w)

        is_last_word = (i == len(clean_words) - 1)
        next_word    = clean_words[i + 1] if not is_last_word else None
        gap_to_next  = (next_word["start"] - w["end"]) if next_word else 0

        text = w["word"]

        is_terminal_punct = ends_with_any(text, terminal_punct)
        is_soft_punct     = ends_with_any(text, soft_punct)
        hit_max_words     = len(current_line) >= max_words
        big_pause         = len(current_line) >= min_words and gap_to_next > pause_threshold

        should_break = (
            is_terminal_punct
            or is_soft_punct
            or hit_max_words
            or big_pause
            or is_last_word
        )

        if should_break:
            lines.append(current_line)
            current_line = []

    if current_line:
        lines.append(current_line)

    # --- Step 3: build subtitles (apply offset HERE, same as Colab's build_srt) ---
    subtitles = []
    for idx, line in enumerate(lines):
        start_time_sec  = apply_offset(line[0]["start"])
        natural_end_sec = apply_offset(line[-1]["end"])

        if idx < len(lines) - 1:
            next_start_sec = apply_offset(lines[idx + 1][0]["start"])
            gap            = next_start_sec - natural_end_sec
            if gap <= gap_bridge_limit:
                end_time_sec = next_start_sec
            else:
                # Extend display time by up to 0.5s into silence gap, prioritizing next sentence start
                end_time_sec = min(natural_end_sec + 0.5, next_start_sec - 0.05)
        else:
            end_time_sec = natural_end_sec + 0.5

        if end_time_sec < start_time_sec + 0.1:
            end_time_sec = start_time_sec + 0.1

        subtitles.append({
            "start": round(start_time_sec, 3),
            "end":   round(end_time_sec, 3),
            "text":  " ".join(w["word"] for w in line),
            "words": [
                {
                    "word":  w["word"],
                    "start": round(apply_offset(w["start"]), 3),
                    "end":   round(apply_offset(w["end"]),   3)
                }
                for w in line
            ]
        })

    return subtitles



@app.post("/api/transcribe")
async def transcribe_media(
    audio: UploadFile = File(None),
    youtubeUrl: str = Form(None),
    leftLogo: UploadFile = File(None),
    rightLogo: UploadFile = File(None),
    minWords: int = Form(3),
    maxWords: int = Form(4),
    animation: str = Form("classic"),
    activeColor: str = Form("#FFFFFF"),
    inactiveColor: str = Form("#FFFFFF"),
    visitorId: str = Form(None),
    uid: str = Form(None),
    openrouterKey: str = Form(None),
    hfToken: str = Form(None),
    groqApiKey: str = Form(None),
    geminiApiKey: str = Form(None),
    captionEngine: str = Form("v1"),
    elevenLabsApiKey: str = Form(None),
    isBatchMode: str = Form(None)
):
    # Check limit for anonymous visitor
    if not uid and visitorId:
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM analytics WHERE visitor_id = ? AND event_type = 'upload'", (visitorId,))
            upload_count = cursor.fetchone()[0]
            conn.close()
            if upload_count >= 2:
                raise HTTPException(status_code=403, detail="LIMIT_REACHED")
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            print(f"Error checking visitor limit: {e}")

    if not audio and not youtubeUrl:
        raise HTTPException(status_code=400, detail="Either audio file or youtubeUrl must be provided.")

    task_id = str(uuid.uuid4())
    public_dir = os.path.abspath("public")
    task_dir = os.path.join(public_dir, f"temp_{task_id}")
    os.makedirs(task_dir, exist_ok=True)
    
    yt_video_rel = None
    if youtubeUrl:
        try:
            audio_path, yt_video_rel = download_youtube_video_and_audio(youtubeUrl, task_dir)
            audio_ext = ".mp3"
        except Exception as err:
            clean_temp_dir(task_dir)
            raise HTTPException(status_code=400, detail=f"Failed to download YouTube video/audio: {str(err)}")
    else:
        audio_ext = os.path.splitext(audio.filename)[1] or ".mp3"
        audio_path = os.path.join(task_dir, f"audio{audio_ext}")
        with open(audio_path, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)
        
    left_logo_rel = None
    if leftLogo:
        left_ext = os.path.splitext(leftLogo.filename)[1] or ".png"
        left_logo_path = os.path.join(task_dir, f"left_logo{left_ext}")
        with open(left_logo_path, "wb") as buffer:
            shutil.copyfileobj(leftLogo.file, buffer)
        left_logo_rel = f"temp_{task_id}/left_logo{left_ext}"
        
    right_logo_rel = None
    if rightLogo:
        right_ext = os.path.splitext(rightLogo.filename)[1] or ".png"
        right_logo_path = os.path.join(task_dir, f"right_logo{right_ext}")
        with open(right_logo_path, "wb") as buffer:
            shutil.copyfileobj(rightLogo.file, buffer)
        right_logo_rel = f"temp_{task_id}/right_logo{right_ext}"
        
    try:
        effective_elevenlabs_key = (elevenLabsApiKey or "").strip() or get_system_key("elevenlabs") or os.environ.get("ELEVENLABS_API_KEY", "").strip()
        effective_groq_key = (groqApiKey or "").strip() or get_system_key("groq") or os.environ.get("GROQ_API_KEY", "").strip()
        effective_openrouter_key = (openrouterKey or "").strip() or get_system_key("openrouter") or os.environ.get("OPENROUTER_CORRECTOR_KEY", "").strip() or os.environ.get("OPENROUTER_API_KEY", "").strip()
        effective_gemini_key = (geminiApiKey or "").strip() or get_system_key("gemini") or os.environ.get("GEMINI_API_KEY", "").strip()

        # If ElevenLabs Scribe V2 is requested
        if captionEngine == "v2" and effective_elevenlabs_key:
            try:
                loop = asyncio.get_event_loop()
                res_dict = await loop.run_in_executor(
                    None,
                    lambda: call_elevenlabs_scribe_sync(audio_path, effective_elevenlabs_key)
                )
                raw_words = res_dict.get("words", [])
                original_text = res_dict.get("text", "")
                
                # Apply the user's line split and format algorithm
                chunks = process_scribe_words(
                    words=raw_words,
                    min_words=minWords,
                    max_words=maxWords,
                    pause_threshold=0.6,
                    gap_bridge_limit=0.35,
                    global_offset=-0.10
                )
                
                duration = raw_words[-1].get("end", 0.0) if raw_words else 0.0
                VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".flv", ".3gp", ".wmv"}
                is_video = audio_ext.lower() in VIDEO_EXTENSIONS
                video_rel = yt_video_rel if yt_video_rel else (f"temp_{task_id}/audio{audio_ext}" if is_video else None)

                import copy
                original_chunks = copy.deepcopy(chunks)
                original_text_str = original_text or "\n".join(c["text"] for c in chunks)
                
                audio_corrected_text = original_text_str
                final_chunks = chunks

                openrouter_key = effective_openrouter_key or effective_gemini_key

                if openrouter_key:
                    try:
                        print(f"[{task_id}] Initiating google/gemini-2.5-pro-preview-05-06 Audio Correction for Scribe...")
                        final_chunks, audio_corrected_text = await correct_scribe_with_gemini(
                            audio_path=audio_path,
                            audio_ext=audio_ext,
                            chunks=chunks,
                            openrouter_key=openrouter_key,
                            model_name="google/gemini-2.5-pro-preview-05-06"
                        )
                    except Exception as scribe_corr_err:
                        print(f"⚠️ ElevenLabs Scribe Gemini audio correction warning: {scribe_corr_err}")
                        audio_corrected_text = original_text_str
                        final_chunks = chunks

                return {
                    "taskId": task_id,
                    "audioPath": f"temp_{task_id}/audio{audio_ext}",
                    "videoPath": video_rel,
                    "durationInSeconds": duration,
                    "segments": final_chunks,
                    "originalText": original_text_str,
                    "originalSegments": original_chunks,
                    "textOnlyText": original_text_str,
                    "audioCorrectedText": audio_corrected_text,
                    "animationType": animation,
                    "activeColor": activeColor,
                    "inactiveColor": inactiveColor,
                    "leftLogo": left_logo_rel,
                    "rightLogo": right_logo_rel
                }
            except Exception as elevenlabs_err:
                print(f"⚠️ ElevenLabs Scribe transcription failed: {elevenlabs_err}")
                raise HTTPException(status_code=400, detail=f"فشل تفريغ ElevenLabs Scribe: {str(elevenlabs_err)}")

        # If Groq API Key is provided or resolved from DB/env, use ultra-fast Groq Whisper Large V3 Turbo!
        if effective_groq_key:
            try:
                chunks, duration, original_text, raw_subtitles, text_only_output, audio_corrected_output = await transcribe_with_groq_whisper(
                    audio_path=audio_path,
                    groq_api_key=effective_groq_key,
                    min_words=minWords,
                    max_words=maxWords,
                    openrouter_key=effective_openrouter_key,
                    gemini_key=effective_gemini_key,
                    skip_correction=False
                )

                VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".flv", ".3gp", ".wmv"}
                is_video = audio_ext.lower() in VIDEO_EXTENSIONS
                video_rel = yt_video_rel if yt_video_rel else (f"temp_{task_id}/audio{audio_ext}" if is_video else None)

                is_ai_corrected = bool(audio_corrected_output or text_only_output)
                ai_note = (
                    "✨ تم تصحيح الترجمة بالذكاء الاصطناعي" if is_ai_corrected
                    else "⚡ تفريغ دقيق (لم يتم توفير مفتاح الذكاء الاصطناعي)"
                )

                return {
                    "taskId": task_id,
                    "audioPath": f"temp_{task_id}/audio{audio_ext}",
                    "videoPath": video_rel,
                    "durationInSeconds": duration,
                    "segments": chunks,
                    "originalText": original_text,
                    "originalSegments": raw_subtitles,
                    "textOnlyText": text_only_output,
                    "audioCorrectedText": audio_corrected_output,
                    "isAiCorrected": is_ai_corrected,
                    "aiCorrectionNote": ai_note,
                    "animationType": animation,
                    "activeColor": activeColor,
                    "inactiveColor": inactiveColor,
                    "leftLogo": left_logo_rel,
                    "rightLogo": right_logo_rel
                }


            except Exception as groq_err:
                print(f"⚠️ Groq transcription failed ({groq_err}). Falling back to local Whisper...")

        model = get_whisper_model()
        print(f"[{task_id}] Transcribing audio file for preview...")
        
        loop = asyncio.get_event_loop()
        segments, info = await loop.run_in_executor(
            None,
            lambda: model.transcribe(audio_path, word_timestamps=True, vad_filter=True)
        )
        
        all_words = []
        for segment in list(segments):
            if segment.words:
                for word in segment.words:
                    all_words.append(word)
                    
        chunks = chunk_words(
            all_words,
            min_words=minWords,
            max_words=maxWords,
            max_pause=0.6
        )
        
        try:
            print(f"[{task_id}] Extracting high-fidelity text with Cohere...")
            try:
                cohere_pipe = get_cohere_pipeline(hf_token=hfToken)
                cohere_res = cohere_pipe(audio_path, generate_kwargs={"max_new_tokens": 256}, return_timestamps=False)
                cohere_raw = cohere_res.get("text", str(cohere_res)) if isinstance(cohere_res, dict) else str(cohere_res)
                cohere_text = clean_repetitive_text(cohere_raw)
            except Exception as c_err:
                print(f"Cohere extraction warning: {c_err}")
                cohere_text = ""

            chunks = await correct_srt_with_cohere_text(
                all_words,
                chunks,
                cohere_text,
                req_key=openrouterKey,
                min_words=minWords,
                max_words=maxWords
            )
        except Exception as e:
            print(f"[{task_id}] Error in AI correction during transcribe: {e}")

        VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".flv", ".3gp", ".wmv"}
        is_video = audio_ext.lower() in VIDEO_EXTENSIONS
        video_rel = yt_video_rel if yt_video_rel else (f"temp_{task_id}/audio{audio_ext}" if is_video else None)

        return {
            "taskId": task_id,
            "audioPath": f"temp_{task_id}/audio{audio_ext}",
            "videoPath": video_rel,
            "durationInSeconds": info.duration,
            "segments": chunks,
            "animationType": animation,
            "activeColor": activeColor,
            "inactiveColor": inactiveColor,
            "leftLogo": left_logo_rel,
            "rightLogo": right_logo_rel
        }
        
    except Exception as e:
        clean_temp_dir(task_dir)
        raise HTTPException(status_code=500, detail=str(e))

TRANSCRIBE_TASKS = {}

@app.get("/api/transcribe-task-status/{task_id}")
async def get_transcribe_task_status(task_id: str):
    if task_id not in TRANSCRIBE_TASKS:
        return {"status": "not_found", "error": "المهمة غير موجودة أو انتهت صلاحيتها."}
    return TRANSCRIBE_TASKS[task_id]

@app.post("/api/transcribe-async")
async def transcribe_media_async(
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(None),
    youtubeUrl: str = Form(None),
    leftLogo: UploadFile = File(None),
    rightLogo: UploadFile = File(None),
    minWords: int = Form(3),
    maxWords: int = Form(4),
    animation: str = Form("classic"),
    activeColor: str = Form("#FFFFFF"),
    inactiveColor: str = Form("#FFFFFF"),
    visitorId: str = Form(None),
    uid: str = Form(None),
    openrouterKey: str = Form(None),
    hfToken: str = Form(None),
    groqApiKey: str = Form(None),
    geminiApiKey: str = Form(None),
    captionEngine: str = Form("v1"),
    elevenLabsApiKey: str = Form(None),
    isBatchMode: str = Form(None)
):
    task_id = str(uuid.uuid4())
    public_dir = os.path.abspath("public")
    task_dir = os.path.join(public_dir, f"temp_{task_id}")
    os.makedirs(task_dir, exist_ok=True)

    saved_audio_file = None
    if audio:
        ext = os.path.splitext(audio.filename)[1] or ".mp3"
        audio_save_path = os.path.join(task_dir, f"input{ext}")
        content = await audio.read()
        with open(audio_save_path, "wb") as f:
            f.write(content)
        saved_audio_file = (audio_save_path, ext)

    saved_left_logo = None
    if leftLogo:
        l_ext = os.path.splitext(leftLogo.filename)[1] or ".png"
        l_path = os.path.join(task_dir, f"left_logo{l_ext}")
        with open(l_path, "wb") as f:
            f.write(await leftLogo.read())
        saved_left_logo = l_path

    saved_right_logo = None
    if rightLogo:
        r_ext = os.path.splitext(rightLogo.filename)[1] or ".png"
        r_path = os.path.join(task_dir, f"right_logo{r_ext}")
        with open(r_path, "wb") as f:
            f.write(await rightLogo.read())
        saved_right_logo = r_path

    TRANSCRIBE_TASKS[task_id] = {"status": "processing", "progress": "جاري بدء معالجة الكابشن وتفريغ الصوت..."}

    async def run_async_transcribe():
        try:
            audio_obj = None
            if saved_audio_file:
                audio_obj = UploadFile(filename=f"input{saved_audio_file[1]}", file=open(saved_audio_file[0], "rb"))
            
            left_logo_obj = UploadFile(filename="left_logo.png", file=open(saved_left_logo, "rb")) if saved_left_logo else None
            right_logo_obj = UploadFile(filename="right_logo.png", file=open(saved_right_logo, "rb")) if saved_right_logo else None

            res = await transcribe_media(
                audio=audio_obj,
                youtubeUrl=youtubeUrl,
                leftLogo=left_logo_obj,
                rightLogo=right_logo_obj,
                minWords=minWords,
                maxWords=maxWords,
                animation=animation,
                activeColor=activeColor,
                inactiveColor=inactiveColor,
                visitorId=visitorId,
                uid=uid,
                openrouterKey=openrouterKey,
                hfToken=hfToken,
                groqApiKey=groqApiKey,
                geminiApiKey=geminiApiKey,
                captionEngine=captionEngine,
                elevenLabsApiKey=elevenLabsApiKey,
                isBatchMode=isBatchMode
            )

            # Close opened file handlers
            if audio_obj and hasattr(audio_obj.file, 'close'): audio_obj.file.close()
            if left_logo_obj and hasattr(left_logo_obj.file, 'close'): left_logo_obj.file.close()
            if right_logo_obj and hasattr(right_logo_obj.file, 'close'): right_logo_obj.file.close()

            TRANSCRIBE_TASKS[task_id] = {
                "status": "success",
                "result": res
            }
        except Exception as e_async:
            print(f"[{task_id}] Transcribe async background failed: {e_async}")
            TRANSCRIBE_TASKS[task_id] = {
                "status": "failed",
                "error": str(e_async)
            }

    background_tasks.add_task(run_async_transcribe)

    async def remove_transcribe_task_state():
        await asyncio.sleep(600)
        if task_id in TRANSCRIBE_TASKS:
            del TRANSCRIBE_TASKS[task_id]

    background_tasks.add_task(remove_transcribe_task_state)
    return {"status": "processing", "taskId": task_id}

def transcribe_youtube_with_gemini_server(youtube_url: str, task_dir: str, api_key: str, chunk_minutes: int = 7) -> str:
    import yt_dlp
    import google.generativeai as genai
    from pydub import AudioSegment
    import re
    import time
    import glob
    
    # 1. Configure GenAI
    genai.configure(api_key=api_key)
    
    # 2. Extract video ID
    pattern = r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})'
    match = re.search(pattern, youtube_url)
    video_id = match.group(1) if match else "temp"
    
    # 3. Download audio using the smart cookie-based yt-dlp method
    audio_path = None
    try:
        audio_path = download_youtube_audio_server(youtube_url, task_dir)
    except Exception as e:
        print(f"[{task_dir}] yt-dlp download failed: {e}")
        raise Exception(f"Failed to download audio from YouTube: {str(e)}")
        
    if not audio_path or not os.path.exists(audio_path):
        raise Exception("Audio file not found after download.")
        
    # 4. Split audio using pydub
    print(f"[{task_dir}] Splitting audio: {audio_path}")
    audio = AudioSegment.from_file(audio_path)
    chunk_length_ms = chunk_minutes * 60 * 1000
    chunks = [audio[i:i + chunk_length_ms] for i in range(0, len(audio), chunk_length_ms)]
    
    full_transcription = ""
    selected_model = "gemini-3.1-flash-lite"
    
    try:
        for idx, chunk in enumerate(chunks):
            start_minute = idx * chunk_minutes
            chunk_filename = os.path.join(task_dir, f"chunk_{video_id}_{idx}.mp3")
            chunk.export(chunk_filename, format="mp3", bitrate="64k")
            
            uploaded_file = None
            try:
                print(f"[{task_dir}] Uploading chunk {idx+1}/{len(chunks)} to Gemini...")
                uploaded_file = genai.upload_file(path=chunk_filename)
                
                # Wait for processing
                while uploaded_file.state.name == "PROCESSING":
                    time.sleep(2)
                    uploaded_file = genai.get_file(uploaded_file.name)
                    
                if uploaded_file.state.name == "FAILED":
                    print(f"[{task_dir}] Chunk {idx+1} processing failed.")
                    continue
                    
                print(f"[{task_dir}] Transcribing chunk {idx+1}...")
                model = genai.GenerativeModel(selected_model)
                prompt = (
                    "اسمع الملف الصوتي المرفق بتركيز. "
                    "قم بتفريغ المحتوى كاملاً باللغة العربية مع توقيتات دقيقة تبدأ من [00:00]. "
                    "لا تلخص واكتب كل ما تسمعه.\n\n"
                    "تنسيق المخرجات المطلوب حصراً:\n[00:05 -> 00:10] النص العربي هنا"
                )
                
                response = model.generate_content([prompt, uploaded_file])
                
                # Adjust timestamps mathematically
                adjusted_text = adjust_timestamps_math(response.text, start_minute)
                full_transcription += "\n" + adjusted_text
                
            except Exception as chunk_err:
                print(f"[{task_dir}] Error processing chunk {idx+1}: {chunk_err}")
                full_transcription += f"\n[خطأ في معالجة الجزء {idx+1}]"
            finally:
                if uploaded_file:
                    try:
                        genai.delete_file(uploaded_file.name)
                    except:
                        pass
                if os.path.exists(chunk_filename):
                    os.remove(chunk_filename)
    finally:
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
            
    return full_transcription.strip()

def adjust_timestamps_math(text, offset_minutes):
    import re
    if offset_minutes == 0:
        return text
        
    offset_seconds = offset_minutes * 60

    def shift_time(time_str):
        try:
            parts = list(map(int, time_str.split(':')))
            if len(parts) == 2: # MM:SS
                total_sec = parts[0] * 60 + parts[1] + offset_seconds
            elif len(parts) == 3: # HH:MM:SS
                total_sec = parts[0] * 3600 + parts[1] * 60 + parts[2] + offset_seconds
            else:
                return time_str

            h = total_sec // 3600
            m = (total_sec % 3600) // 60
            s = total_sec % 60

            if h > 0:
                return f"{h:02d}:{m:02d}:{s:02d}"
            else:
                return f"{m:02d}:{s:02d}"
        except Exception:
            return time_str

    def repl(match):
        start = shift_time(match.group(1))
        end = shift_time(match.group(2))
        return f"[{start} -> {end}]"

    pattern = r'\[\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*->\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\]'
    return re.sub(pattern, repl, text)

class GeminiTranscribeRequest(BaseModel):
    youtubeUrl: str
    geminiApiKey: str | None = None

def download_audio_executor(youtube_url: str, opts: dict):
    import yt_dlp
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([youtube_url])

@app.post("/api/transcribe-gemini")
async def transcribe_gemini(req: GeminiTranscribeRequest):
    task_id = str(uuid.uuid4())
    public_dir = os.path.abspath("public")
    task_dir = os.path.join(public_dir, f"temp_{task_id}")
    os.makedirs(task_dir, exist_ok=True)
    
    try:
        loop = asyncio.get_event_loop()
        audio_path = await loop.run_in_executor(None, lambda: download_youtube_audio_server(req.youtubeUrl, task_dir))
        
        if not os.path.exists(audio_path):
            raise Exception("Audio file was not created by yt-dlp postprocessor.")
            
        print(f"[{task_id}] Successfully downloaded YouTube audio to: {audio_path}")
        return {
            "status": "success",
            "audioUrl": f"public/temp_{task_id}/audio.mp3"
        }
    except Exception as e:
        clean_temp_dir(task_dir)
        print(f"[{task_id}] Failed to download audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))

cohere_pipelines = {}

def get_cohere_pipeline(hf_token: str = None):
    token_key = hf_token or os.environ.get("HF_TOKEN") or "default"
    if token_key not in cohere_pipelines:
        import torch
        from transformers import pipeline
        from huggingface_hub import login
        
        token_val = hf_token or os.environ.get("HF_TOKEN")
        if token_val:
            try:
                login(token=token_val)
                print(f"Logged in successfully to HF for Cohere pipeline!")
            except Exception as login_err:
                print(f"HF Login warning: {login_err}")
                
        print("Loading Cohere Arabic ASR model on CPU with authenticated token...")
        cohere_pipelines[token_key] = pipeline(
            "automatic-speech-recognition",
            model="CohereLabs/cohere-transcribe-arabic-07-2026",
            device="cpu",
            token=token_val,
            chunk_length_s=30,
        )
    return cohere_pipelines[token_key]

def clean_repetitive_text(text: str) -> str:
    if not text:
        return ""
    words = text.split()
    n = len(words)
    if n < 4:
        return text

    i = 0
    cleaned_words = []
    while i < n:
        duplicated = False
        for phrase_len in range(min(15, (n - i) // 2), 2, -1):
            phrase = words[i : i + phrase_len]
            next_phrase = words[i + phrase_len : i + 2 * phrase_len]
            if phrase == next_phrase:
                cleaned_words.extend(phrase)
                i += 2 * phrase_len
                while i + phrase_len <= n and words[i : i + phrase_len] == phrase:
                    i += phrase_len
                duplicated = True
                break
        if not duplicated:
            cleaned_words.append(words[i])
            i += 1
            
    return " ".join(cleaned_words)

async def correct_srt_with_cohere_text(all_words, chunks, cohere_text: str, req_key: str = None, min_words: int = 1, max_words: int = 3):
    openrouter_key = (
        (req_key and req_key.strip())
        or os.environ.get("OPENROUTER_CORRECTOR_KEY", "").strip()
        or os.environ.get("OPENROUTER_API_KEY", "").strip()
        or ""
    )
    
    if not openrouter_key or not cohere_text or not cohere_text.strip():
        print("⚠️ Skipping AI correction (Missing OPENROUTER_CORRECTOR_KEY or Cohere text).")
        return chunks
        
    try:
        srt_lines = []
        for idx, chunk in enumerate(chunks, 1):
            start_str = format_srt_timestamp(chunk["start"])
            end_str = format_srt_timestamp(chunk["end"])
            srt_lines.append(f"{idx}\n{start_str} --> {end_str}\n{chunk['text']}\n")
        srt_content = "\n".join(srt_lines)
        
        prompt = (
            "أنت خبير في تصحيح ملفات الـ SRT العربية مع الحفاظ على الكلمات تماماً.\n\n"
            "لديك مصدريْن:\n"
            "1. [Cohere Transcript] - نص التفريغ العالي الجودة: هو المرجع الوحيد للكلمات التي يجب أن تظهر في الكابشن النهائي. خذ الكلمات منه حرفياً.\n"
            "2. [Whisper SRT] - ملف التوقيتات: هو المرجع الوحيد للتوقيتات وأرقام المقاطع وعدد السطور. لا تغير أي توقيت أو رقم.\n\n"
            "قواعد صارمة ومطلقة:\n"
            "1. خذ الكلمات حرفياً من نص Cohere - ممنوع اختراع كلمات أو تغيير معنى.\n"
            "2. الشيء الوحيد المسموح تعديله هو ضبط الهمزات حسب قواعد اللغة العربية الصحيحة:\n"
            "   - همزة القطع (تُكتب أ/إ): في أوائل الأفعال الثلاثية وما يشتق منها مثل: أنه، أعتقد، إن، إذا.\n"
            "   - همزة الوصل (لا تُكتب): في الأفعال الخماسية والسداسية والأسماء مثل: اشترك، استمع، انطلق، اسم، ابن.\n"
            "   - لا تضع همزة قطع على كل ألف في بداية الكلمة، بل طبّق القاعدة الصحيحة.\n"
            "3. لا تضيف كلمات ولا تحذف كلمات من نص Cohere.\n"
            "4. الزم بنفس عدد المقاطع والتوقيتات في ملف Whisper SRT بدون أي تغيير.\n"
            "5. أرجع ملف SRT فقط بدون مقدمات أو كتل كود.\n\n"
            f"[Cohere Transcript]:\n{cohere_text}\n\n"
            f"[Whisper SRT]:\n{srt_content}"
        )
        
        target_model = "google/gemini-2.5-flash"
        payload = {
            "model": target_model,
            "messages": [{"role": "user", "content": prompt}]
        }
        headers = {
            "Authorization": f"Bearer {openrouter_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://rekaption.hf.space",
            "X-Title": "ReKaption"
        }
        response_json = None
        max_attempts = 4
        for attempt in range(1, max_attempts + 1):
            print(f"Initiating OpenRouter AI correction with model {target_model} (Attempt {attempt}/{max_attempts})...")
            try:
                res = await asyncio.to_thread(call_openrouter_sync, payload, headers)
                if "choices" in res and res["choices"] and res["choices"][0].get("message", {}).get("content", "").strip():
                    response_json = res
                    print(f"Successfully received correction response from OpenRouter using model {target_model} on attempt {attempt}")
                    break
                else:
                    print(f"Attempt {attempt}/{max_attempts} model {target_model} empty/invalid response. Retrying same model...")
            except Exception as err_or:
                print(f"Attempt {attempt}/{max_attempts} model {target_model} warning: {err_or}")
            await asyncio.sleep(1.5)

        if not response_json:
            print("⚠️ All OpenRouter models failed to return a response.")
            return chunks

        choices = response_json.get("choices", [])
        if choices:
            llm_response = choices[0].get("message", {}).get("content", "")
            cleaned_srt = clean_llm_srt(llm_response)
            parsed_segments = parse_srt_content(cleaned_srt)
            
            if parsed_segments:
                print(f"Successfully parsed {len(parsed_segments)} corrected segments from Gemini 2.5 Flash.")
                corr_word_texts = []
                for seg in parsed_segments:
                    corr_word_texts.extend(seg["text"].split())
                    
                orig_words_list = [{"word": w.word if hasattr(w, "word") else w.get("word", ""),
                                    "start": w.start if hasattr(w, "start") else w.get("start", 0),
                                    "end": w.end if hasattr(w, "end") else w.get("end", 0)} for w in all_words]
                
                aligned_corrected_words = align_timestamps(orig_words_list, corr_word_texts)
                if aligned_corrected_words:
                    new_chunks = chunk_words(
                        aligned_corrected_words,
                        min_words=min_words,
                        max_words=max_words,
                        max_pause=0.6
                    )
                    return new_chunks
    except Exception as err:
        print(f"⚠️ OpenRouter Cohere-Whisper hybrid correction warning: {err}")
        
    return chunks

@app.post("/api/transcribe-cohere")
async def transcribe_cohere_endpoint(
    audio: UploadFile = File(...),
    hf_token: str = Form(None)
):
    task_id = str(uuid.uuid4())
    public_dir = os.path.abspath("public")
    task_dir = os.path.join(public_dir, f"temp_{task_id}")
    os.makedirs(task_dir, exist_ok=True)
    
    audio_ext = os.path.splitext(audio.filename)[1] or ".mp3"
    audio_path = os.path.join(task_dir, f"audio{audio_ext}")
    with open(audio_path, "wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)
        
    try:
        loop = asyncio.get_event_loop()
        
        def run_cohere():
            pipe = get_cohere_pipeline(hf_token)
            res = pipe(
                audio_path,
                generate_kwargs={"max_new_tokens": 256},
                return_timestamps=False
            )
            raw_text = res.get("text", str(res)) if isinstance(res, dict) else str(res)
            return clean_repetitive_text(raw_text)
            
        transcribed_text = await loop.run_in_executor(None, run_cohere)
        clean_temp_dir(task_dir)
        return {
            "status": "success",
            "text": transcribed_text
        }
    except Exception as e:
        clean_temp_dir(task_dir)
        print(f"[{task_id}] Cohere ASR error: {e}")
        raise HTTPException(status_code=500, detail=f"خطأ في تفريغ Cohere: {str(e)}")




async def run_render_task(task_id: str, request_data: RenderRequest):
    public_dir = os.path.abspath("public")
    task_dir = os.path.join(public_dir, f"temp_{task_id}")
    
    try:
        props_path = os.path.join(task_dir, "captions.json")
        import json
        with open(props_path, "w", encoding="utf-8") as f:
            json.dump(request_data.model_dump(), f, ensure_ascii=False, indent=2)
            
        output_video_path = os.path.join(task_dir, "output.mp4")
        print(f"[{task_id}] Rendering video with user edits (concurrency=6)...")
        
        render_cmd = [
            "npx", "remotion", "render",
            "src/index.ts",
            "CaptionsVideo",
            output_video_path,
            "--props", props_path,
            "--concurrency=6",
            "--jpeg-quality=60",
            "--log=error",
            "--browser-args=--no-sandbox --disable-dev-shm-usage --disable-gpu --no-zygote --disable-extensions --disable-background-timer-throttling --disable-backgrounding-occluded-windows"
        ]
        
        render_env = {**os.environ, "REMOTION_DISABLE_TELEMETRY": "1"}
        process = await asyncio.create_subprocess_exec(
            *render_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=render_env
        )
        
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=900.0)
        except asyncio.TimeoutError:
            try:
                process.kill()
            except Exception:
                pass
            print(f"[{task_id}] Remotion rendering process timed out after 900 seconds.")
            RENDER_TASKS[task_id] = {"status": "failed", "error": "استغرقت عملية رندرة الفيديو وقتاً أطول من المتوقع وانتهت مهلة الانتظار."}
            clean_temp_dir(task_dir)
            return
            
        if process.returncode != 0:
            err_msg = stderr.decode() if stderr else "Unknown rendering error"
            print(f"[{task_id}] Render failed with code {process.returncode}: {err_msg}")
            RENDER_TASKS[task_id] = {"status": "failed", "error": err_msg}
            clean_temp_dir(task_dir)
            return
            
        print(f"[{task_id}] Render completed successfully!")
        RENDER_TASKS[task_id] = {"status": "success", "videoUrl": f"api/render-download/{task_id}"}
    except Exception as e:
        print(f"[{task_id}] Unexpected render error: {str(e)}")
        RENDER_TASKS[task_id] = {"status": "failed", "error": str(e)}
        clean_temp_dir(task_dir)

@app.post("/api/render/{task_id}")
async def render_video_edited(
    task_id: str,
    request_data: RenderRequest
):
    public_dir = os.path.abspath("public")
    task_dir = os.path.join(public_dir, f"temp_{task_id}")
    
    if not os.path.exists(task_dir):
        raise HTTPException(status_code=404, detail="Task workspace not found or expired.")
        
    RENDER_TASKS[task_id] = {"status": "processing"}
    asyncio.create_task(run_render_task(task_id, request_data))
    
    return {"status": "processing", "task_id": task_id}

@app.get("/api/render-status/{task_id}")
async def get_render_status(task_id: str):
    if task_id not in RENDER_TASKS:
        return {"status": "not_found", "error": "المهمة غير موجودة أو انتهت صلاحيتها."}
    return RENDER_TASKS[task_id]

@app.get("/api/render-download/{task_id}")
async def download_rendered_video(task_id: str, background_tasks: BackgroundTasks):
    public_dir = os.path.abspath("public")
    task_dir = os.path.join(public_dir, f"temp_{task_id}")
    output_video_path = os.path.join(task_dir, "output.mp4")
    
    if not os.path.exists(output_video_path):
        raise HTTPException(status_code=404, detail="Video not found")
        
    background_tasks.add_task(clean_temp_dir, task_dir)
    # Also clean up the task state after a delay to avoid memory leak
    async def remove_task_state():
        await asyncio.sleep(60)
        if task_id in RENDER_TASKS:
            del RENDER_TASKS[task_id]
    background_tasks.add_task(remove_task_state)
    
    return FileResponse(
        output_video_path,
        media_type="video/mp4",
        filename="rekaption_output.mp4"
    )

@app.post("/api/generate")
async def generate_video(
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(...),
    leftLogo: UploadFile = File(None),
    rightLogo: UploadFile = File(None),
    minWords: int = Form(2),
    maxWords: int = Form(5),
    animation: str = Form("classic"),
    activeColor: str = Form("#FFFFFF"),
    inactiveColor: str = Form("#FFFFFF"),
    showTitle: bool = Form(True),
    titleText: str = Form(""),
    titleSubtext: str = Form(""),
    titleColor: str = Form("#FFFFFF"),
    titleBgColor: str = Form("#000000"),
    titleDuration: float = Form(3.0),
    titleTop: float = Form(12.0),
    titleStyle: str = Form("tiktok-pill")
):
    # 1. Create a unique task ID and workspace
    task_id = str(uuid.uuid4())
    public_dir = os.path.abspath("public")
    task_dir = os.path.join(public_dir, f"temp_{task_id}")
    os.makedirs(task_dir, exist_ok=True)
    
    # Define file paths relative to project root
    audio_ext = os.path.splitext(audio.filename)[1] or ".mp3"
    audio_path = os.path.join(task_dir, f"audio{audio_ext}")
    
    # Save the audio file
    with open(audio_path, "wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)
        
    left_logo_rel = None
    if leftLogo:
        left_ext = os.path.splitext(leftLogo.filename)[1] or ".png"
        left_logo_path = os.path.join(task_dir, f"left_logo{left_ext}")
        with open(left_logo_path, "wb") as buffer:
            shutil.copyfileobj(leftLogo.file, buffer)
        left_logo_rel = f"temp_{task_id}/left_logo{left_ext}"
        
    right_logo_rel = None
    if rightLogo:
        right_ext = os.path.splitext(rightLogo.filename)[1] or ".png"
        right_logo_path = os.path.join(task_dir, f"right_logo{right_ext}")
        with open(right_logo_path, "wb") as buffer:
            shutil.copyfileobj(rightLogo.file, buffer)
        right_logo_rel = f"temp_{task_id}/right_logo{right_ext}"
        
    try:
        # 2. Run Whisper Transcription using faster-whisper
        model = get_whisper_model()
        print(f"[{task_id}] Transcribing audio file...")
        
        # Run in executor to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        segments, info = await loop.run_in_executor(
            None,
            lambda: model.transcribe(audio_path, word_timestamps=True, vad_filter=True)
        )
        
        # Extract all words
        all_words = []
        for segment in list(segments):
            if segment.words:
                for word in segment.words:
                    all_words.append(word)
                    
        # Chunk words based on user settings
        chunks = chunk_words(
            all_words,
            min_words=minWords,
            max_words=maxWords,
            max_pause=0.6
        )
        
        # --- AI CORRECTION PIPELINE (OpenRouter + Gemini-3.1-Flash-Lite) ---
        try:
            print(f"[{task_id}] Initiating AI transcription correction with OpenRouter...")
            
            # 1. Format the initial chunks to SRT string
            srt_lines = []
            for idx, chunk in enumerate(chunks, 1):
                start_str = format_srt_timestamp(chunk["start"])
                end_str = format_srt_timestamp(chunk["end"])
                srt_lines.append(f"{idx}\n{start_str} --> {end_str}\n{chunk['text']}\n")
            srt_content = "\n".join(srt_lines)
            
            # 2. Extract audio and encode to Base64
            audio_base64, audio_format = await extract_and_encode_audio(audio_path, task_dir)
            
            # 3. Build the prompt and payload
            prompt = (
                "عدل الملف بناءا على الصوت يعني الاولوية للصوت , فقط تلتزم بعدد الجمل والتوقيتات اللي في الملف , "
                "فقط انت تصحح الملف بناءا على الصوت وصحح الهمزات لو لزم الام.\n\n"
                "ملاحظة هامة جداً: يجب أن تعيد ملف الـ SRT المصحح فقط! دون أي مقدمات، دون أي شرح، ودون أي علامات تنصيص أو كتل كود (مثل ```srt).\n\n"
                f"ملف الـ SRT الأصلي:\n{srt_content}"
            )
            
            payload = {
                "model": "google/gemini-2.5-pro-preview-05-06",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "input_audio",
                                "input_audio": {
                                    "data": audio_base64,
                                    "format": audio_format
                                }
                            }
                        ]
                    }
                ]
            }
            
            headers = {
                "Authorization": f"Bearer {openrouter_key.strip()}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://rekaption.hf.space",
                "X-Title": "ReKaption"
            }
            
            # 4. Call OpenRouter API asynchronously
            print(f"[{task_id}] Sending request to OpenRouter (google/gemini-2.5-pro-preview-05-06)...")
            response_json = await asyncio.to_thread(call_openrouter_sync, payload, headers)
            
            # 5. Extract and clean the SRT output
            choices = response_json.get("choices", [])
            if choices:
                llm_response = choices[0].get("message", {}).get("content", "")
                cleaned_srt = clean_llm_srt(llm_response)
                
                # 6. Parse the corrected SRT
                parsed_segments = parse_srt_content(cleaned_srt)
                
                if parsed_segments:
                    print(f"[{task_id}] Successfully parsed {len(parsed_segments)} corrected segments from LLM.")
                    
                    # 7. Rebuild chunks with word-level interpolation
                    corrected_chunks = []
                    for seg in parsed_segments:
                        words_in_seg = seg["text"].split()
                        if not words_in_seg:
                            continue
                            
                        start_time = seg["start"]
                        end_time = seg["end"]
                        duration = end_time - start_time
                        num_words = len(words_in_seg)
                        
                        words_list = []
                        for idx, word in enumerate(words_in_seg):
                            w_start = start_time + idx * (duration / num_words)
                            w_end = start_time + (idx + 1) * (duration / num_words)
                            words_list.append({
                                "word": word,
                                "start": round(w_start, 3),
                                "end": round(w_end, 3)
                            })
                            
                        corrected_chunks.append({
                            "start": start_time,
                            "end": end_time,
                            "text": seg["text"],
                            "words": words_list
                        })
                    
                    # Update chunks with the corrected version
                    if corrected_chunks:
                        chunks = corrected_chunks
                        print(f"[{task_id}] Successfully replaced captions with AI corrected version!")
                else:
                    print(f"[{task_id}] Warning: Parsed segments from LLM was empty. Using original Whisper transcription.")
            else:
                print(f"[{task_id}] Warning: No choices returned from OpenRouter. Using original Whisper transcription.")
                
        except Exception as e:
            print(f"[{task_id}] Error in AI correction pipeline: {e}. Falling back to original Whisper transcription.")

        # 3. Create captions.json
        import json
        
        # Detect if uploaded file is a video
        VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".flv", ".3gp", ".wmv"}
        is_video = audio_ext.lower() in VIDEO_EXTENSIONS
        video_rel = f"temp_{task_id}/audio{audio_ext}" if is_video else None
        
        captions_data = {
            "audioPath": f"temp_{task_id}/audio{audio_ext}",
            "videoPath": video_rel,
            "durationInSeconds": info.duration,
            "segments": chunks,
            "animationType": animation,
            "activeColor": activeColor,
            "inactiveColor": inactiveColor,
            "leftLogo": left_logo_rel,
            "rightLogo": right_logo_rel,
            "showBg": True,
            "showTitle": showTitle,
            "titleText": titleText,
            "titleSubtext": titleSubtext,
            "titleColor": titleColor,
            "titleBgColor": titleBgColor,
            "titleDuration": titleDuration,
            "titleTop": titleTop,
            "titleStyle": titleStyle
        }
        
        props_path = os.path.join(task_dir, "captions.json")
        with open(props_path, "w", encoding="utf-8") as f:
            json.dump(captions_data, f, ensure_ascii=False, indent=2)
            
        # 4. Render Video using Remotion CLI
        output_video_path = os.path.join(task_dir, "output.mp4")
        print(f"[{task_id}] Rendering video...")
        
        # Build rendering command
        render_cmd = [
            "npx", "remotion", "render",
            "src/index.ts",
            "CaptionsVideo",
            output_video_path,
            "--props", props_path,
            "--concurrency=2",
            "--browser-args=--no-sandbox"
        ]
        
        # Run the subprocess asynchronously
        process = await asyncio.create_subprocess_exec(
            *render_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            print(f"[{task_id}] Render failed with code {process.returncode}")
            print(f"Stderr: {stderr.decode()}")
            raise HTTPException(status_code=500, detail=f"Remotion rendering failed: {stderr.decode()}")
            
        print(f"[{task_id}] Render completed successfully!")
        
        # Add background task to clean up the temporary directory after the response is sent
        background_tasks.add_task(clean_temp_dir, task_dir)
        
        # 5. Return the generated video file
        return FileResponse(
            output_video_path,
            media_type="video/mp4",
            filename="rekaption_output.mp4"
        )
        
    except Exception as e:
        # In case of failure, clean up the directory and raise HTTP exception
        clean_temp_dir(task_dir)
        if isinstance(e, HTTPException):
            raise e
        print(f"Error during video generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== SQLite Analytics System ====================
DB_PATH = "analytics.db"

def init_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                visitor_id TEXT,
                event_type TEXT,
                is_new INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                uid TEXT PRIMARY KEY,
                email TEXT,
                name TEXT,
                whatsapp TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_keys (
                key_name TEXT PRIMARY KEY,
                key_value TEXT
            )
        """)
        conn.commit()
        
        # Check if is_active column exists, if not add it dynamically
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        if "is_active" not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1")
            conn.commit()
            
        conn.close()
        print("Database initialized successfully.")
    except Exception as e:
        print(f"Error initializing database: {e}")

def get_system_key(key_name: str) -> str:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT key_value FROM system_keys WHERE key_name = ?", (key_name,))
        row = cursor.fetchone()
        conn.close()
        if row and row[0]:
            return row[0].strip()
    except Exception:
        pass
    return ""

init_db()

class TrackEvent(BaseModel):
    visitor_id: str
    event_type: str
    is_new: bool

@app.post("/api/track")
def track_event(event: TrackEvent):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO analytics (visitor_id, event_type, is_new) VALUES (?, ?, ?)",
            (event.visitor_id, event.event_type, 1 if event.is_new else 0)
        )
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        print(f"Error tracking event: {e}")
        return {"status": "error", "message": str(e)}

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/admin/login")
def admin_login(req: LoginRequest):
    if req.email == "admin@admin.com" and req.password == "147741":
        return {"status": "success", "token": "admin-session-token-12345"}
    raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

@app.get("/api/admin/stats")
def get_admin_stats(token: str = None):
    if token != "admin-session-token-12345":
        raise HTTPException(status_code=401, detail="غير مصرح بالدخول")
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Total visits
        cursor.execute("SELECT COUNT(*) FROM analytics WHERE event_type = 'visit'")
        total_visits = cursor.fetchone()[0]
        
        # New visits
        cursor.execute("SELECT COUNT(*) FROM analytics WHERE event_type = 'visit' AND is_new = 1")
        new_visits = cursor.fetchone()[0]
        
        # Returning visits
        cursor.execute("SELECT COUNT(*) FROM analytics WHERE event_type = 'visit' AND is_new = 0")
        returning_visits = cursor.fetchone()[0]
        
        # Total uploads
        cursor.execute("SELECT COUNT(*) FROM analytics WHERE event_type = 'upload'")
        total_uploads = cursor.fetchone()[0]
        
        # Total renders
        cursor.execute("SELECT COUNT(*) FROM analytics WHERE event_type = 'render'")
        total_renders = cursor.fetchone()[0]
        
        # Recent events
        cursor.execute("SELECT id, visitor_id, event_type, is_new, timestamp FROM analytics ORDER BY id DESC LIMIT 50")
        rows = cursor.fetchall()
        recent_events = []
        for r in rows:
            recent_events.append({
                "id": r[0],
                "visitor_id": r[1],
                "event_type": r[2],
                "is_new": bool(r[3]),
                "timestamp": r[4]
            })
            
        # Total registered users
        cursor.execute("SELECT COUNT(*) FROM users")
        total_users = cursor.fetchone()[0]

        # Recent registered users list
        cursor.execute("SELECT uid, email, name, whatsapp, created_at, is_active FROM users ORDER BY created_at DESC LIMIT 50")
        user_rows = cursor.fetchall()
        recent_users = []
        for ur in user_rows:
            is_active_val = ur[5] if ur[5] is not None else 1
            recent_users.append({
                "uid": ur[0],
                "email": ur[1],
                "name": ur[2],
                "whatsapp": ur[3],
                "created_at": ur[4],
                "is_active": bool(is_active_val)
            })
            
        conn.close()
        
        return {
            "total_visits": total_visits,
            "new_visits": new_visits,
            "returning_visits": returning_visits,
            "total_uploads": total_uploads,
            "total_renders": total_renders,
            "total_users": total_users,
            "recent_events": recent_events,
            "recent_users": recent_users
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UserRegRequest(BaseModel):
    uid: str
    email: str
    name: str

class UpdateWhatsappRequest(BaseModel):
    uid: str
    whatsapp: str

class ToggleUserRequest(BaseModel):
    uid: str
    is_active: bool
    token: str

@app.post("/api/admin/toggle-user-status")
def toggle_user_status(req: ToggleUserRequest):
    if req.token != "admin-session-token-12345":
        raise HTTPException(status_code=401, detail="غير مصرح بالدخول")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET is_active = ? WHERE uid = ?", (1 if req.is_active else 0, req.uid))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/users/register-login")
def register_login(req: UserRegRequest):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT uid, email, name, whatsapp, is_active FROM users WHERE uid = ?", (req.uid,))
        row = cursor.fetchone()
        if row:
            is_active_val = row[4] if row[4] is not None else 1
            user_data = {"uid": row[0], "email": row[1], "name": row[2], "whatsapp": row[3], "is_active": bool(is_active_val)}
        else:
            cursor.execute(
                "INSERT INTO users (uid, email, name, whatsapp, is_active) VALUES (?, ?, ?, NULL, 1)",
                (req.uid, req.email, req.name)
            )
            conn.commit()
            user_data = {"uid": req.uid, "email": req.email, "name": req.name, "whatsapp": None, "is_active": True}
        conn.close()
        return user_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/users/update-whatsapp")
def update_whatsapp(req: UpdateWhatsappRequest):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET whatsapp = ? WHERE uid = ?", (req.whatsapp, req.uid))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SystemKeysRequest(BaseModel):
    token: str
    groq_api_key: str = ""
    elevenlabs_api_key: str = ""
    openrouter_api_key: str = ""
    gemini_api_key: str = ""

@app.post("/api/admin/save-system-keys")
def save_system_keys(req: SystemKeysRequest):
    if req.token != "admin-session-token-12345":
        raise HTTPException(status_code=401, detail="غير مصرح بالدخول")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        keys_map = {
            "groq": req.groq_api_key.strip(),
            "elevenlabs": req.elevenlabs_api_key.strip(),
            "openrouter": req.openrouter_api_key.strip(),
            "gemini": req.gemini_api_key.strip(),
        }
        for k, v in keys_map.items():
            if v:
                cursor.execute("INSERT OR REPLACE INTO system_keys (key_name, key_value) VALUES (?, ?)", (k, v))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/get-system-keys")
def get_system_keys_api(token: str = None):
    if token != "admin-session-token-12345":
        raise HTTPException(status_code=401, detail="غير مصرح بالدخول")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT key_name, key_value FROM system_keys")
        rows = cursor.fetchall()
        conn.close()
        return {r[0]: r[1] for r in rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve public folder for previewing uploaded media files
public_dir_path = os.path.abspath("public")
os.makedirs(public_dir_path, exist_ok=True)
app.mount("/public", StaticFiles(directory=public_dir_path), name="public")
print(f"Successfully mounted public folder from {public_dir_path}")

# Serve static frontend files (prefers netlify-deploy, falls back to frontend/dist)
netlify_deploy = os.path.join(os.path.dirname(__file__), "netlify-deploy")
frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")

if os.path.exists(netlify_deploy):
    app.mount("/", StaticFiles(directory=netlify_deploy, html=True), name="frontend")
    print(f"Successfully mounted netlify-deploy static files from {netlify_deploy}")
elif os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
    print(f"Successfully mounted frontend static files from {frontend_dist}")
else:
    print(f"Frontend static files not found. Running in API-only mode.")
