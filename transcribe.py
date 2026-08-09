import argparse
import json
import os
import shutil
import torch
from faster_whisper import WhisperModel

def ends_with_punctuation(text: str) -> bool:
    if not text:
        return False
    t = text.strip()
    if not t:
        return False
    # Check if last character is a common Arabic/English sentence or clause punctuation mark
    punctuation_chars = {'.', '?', '!', '،', '؟', ',', ';', '؛', ':', '-'}
    if t.endswith('...'):
        return True
    return t[-1] in punctuation_chars

def get_word_prop(word_obj, prop_name):
    if isinstance(word_obj, dict):
        return word_obj.get(prop_name)
    else:
        return getattr(word_obj, prop_name, None)

def chunk_words(words, min_words=3, max_words=5, max_pause=0.6):
    chunks = []
    current_chunk = []
    
    for word in words:
        word_text = get_word_prop(word, "word")
        if word_text is None:
            continue
        word_text = word_text.strip()
        if not word_text:
            continue
            
        word_start = get_word_prop(word, "start")
        word_end = get_word_prop(word, "end")
        
        should_split = False
        
        # 1. If we reach the maximum word limit per chunk
        if len(current_chunk) >= max_words:
            should_split = True
        # 2. Punctuation-based splitting: if the previous word ended a clause/sentence
        elif current_chunk and ends_with_punctuation(current_chunk[-1]["word"]):
            should_split = True
        # 3. If there's a significant pause in speech and we have met the minimum words
        elif current_chunk:
            last_word = current_chunk[-1]
            pause = word_start - last_word["end"]
            if pause > max_pause and len(current_chunk) >= min_words:
                should_split = True
                
        if should_split and current_chunk:
            chunks.append(create_chunk_object(current_chunk))
            current_chunk = []
            
        current_chunk.append({
            "word": word_text,
            "start": word_start,
            "end": word_end
        })
        
    if current_chunk:
        chunks.append(create_chunk_object(current_chunk))
        
    return chunks

def create_chunk_object(word_list):
    text = " ".join([w["word"] for w in word_list])
    return {
        "start": word_list[0]["start"],
        "end": word_list[-1]["end"],
        "text": text,
        "words": word_list
    }

def main():
    parser = argparse.ArgumentParser(description="Transcribe audio using faster-whisper and generate captions for Remotion.")
    parser.add_argument("--audio", required=True, help="Path to input audio file")
    parser.add_argument("--output", default="src/captions.json", help="Path to output JSON file")
    parser.add_argument("--model", default="medium", help="faster-whisper model size (tiny, base, small, medium, large-v2, large-v3)")
    parser.add_argument("--min-words", type=int, default=3, help="Minimum words per block")
    parser.add_argument("--max-words", type=int, default=5, help="Maximum words per block")
    parser.add_argument("--max-pause", type=float, default=0.6, help="Pause duration to trigger split")
    parser.add_argument("--animation", default="pop", choices=["pop", "wave", "slide"], help="Remotion animation style")
    parser.add_argument("--active-color", default=None, help="Hex color code for active word (e.g. #FFDE4D)")
    parser.add_argument("--inactive-color", default=None, help="Hex color code for other words (e.g. #FFFFFF)")
    parser.add_argument("--left-logo", default=None, help="Path to local image for the top-left logo")
    parser.add_argument("--right-logo", default=None, help="Path to local image for the top-right logo")
    
    args = parser.parse_args()
    
    # Auto-detect GPU/CPU
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    print(f"Loading faster-whisper model '{args.model}' on {device} ({compute_type})...")
    
    model = WhisperModel(args.model, device=device, compute_type=compute_type)
    
    print(f"Transcribing: {args.audio}...")
    segments, info = model.transcribe(
        args.audio,
        word_timestamps=True,
        vad_filter=True
    )
    
    # Extract all words
    all_words = []
    for segment in segments:
        if segment.words:
            for word in segment.words:
                all_words.append(word)
                
    # Chunk the words
    chunks = chunk_words(
        all_words, 
        min_words=args.min_words, 
        max_words=args.max_words, 
        max_pause=args.max_pause
    )
    
    # Create public directory if it doesn't exist
    public_dir = os.path.abspath("public")
    os.makedirs(public_dir, exist_ok=True)
    
    audio_filename = os.path.basename(args.audio)
    dest_audio_path = os.path.join(public_dir, audio_filename)
    
    if os.path.abspath(args.audio) != dest_audio_path:
        shutil.copy2(args.audio, dest_audio_path)
        print(f"Copied audio file to project public/ directory: {dest_audio_path}")
        
    left_logo_filename = None
    if args.left_logo:
        if os.path.exists(args.left_logo):
            left_logo_filename = os.path.basename(args.left_logo)
            dest_left_logo = os.path.join(public_dir, left_logo_filename)
            if os.path.abspath(args.left_logo) != dest_left_logo:
                shutil.copy2(args.left_logo, dest_left_logo)
                print(f"Copied left logo to project public/ directory: {dest_left_logo}")
        else:
            print(f"Warning: Left logo file not found at {args.left_logo}")

    right_logo_filename = None
    if args.right_logo:
        if os.path.exists(args.right_logo):
            right_logo_filename = os.path.basename(args.right_logo)
            dest_right_logo = os.path.join(public_dir, right_logo_filename)
            if os.path.abspath(args.right_logo) != dest_right_logo:
                shutil.copy2(args.right_logo, dest_right_logo)
                print(f"Copied right logo to project public/ directory: {dest_right_logo}")
        else:
            print(f"Warning: Right logo file not found at {args.right_logo}")

    output_data = {
        "audioPath": audio_filename,
        "durationInSeconds": info.duration, # exact duration from faster-whisper
        "segments": chunks,
        "animationType": args.animation,
        "activeColor": args.active_color,
        "inactiveColor": args.inactive_color,
        "leftLogo": left_logo_filename,
        "rightLogo": right_logo_filename
    }
    
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully generated {len(chunks)} caption chunks and saved to {args.output}")

if __name__ == "__main__":
    main()
