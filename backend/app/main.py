from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import threading
import io
import tempfile
import os
import torch
import torchaudio
from demucs.pretrained import get_model
from demucs.apply import apply_model
from collections import Counter
from typing import Dict
from pydub import AudioSegment
import urllib.parse
import subprocess

try:
  import essentia.standard as es
  ESSENTIA_AVAILABLE = True
except ModuleNotFoundError:
  ESSENTIA_AVAILABLE = False

app = FastAPI()

class MixRequest(BaseModel):
    volumes: Dict[str, float]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

ALLOWED_EXTENSIONS = {'wav', 'mp3', 'flac', 'm4a', 'ogg', 'mp4'}
AUDIO_EXTENSIONS = {'mp3', 'flac', 'm4a', 'ogg', 'mp4'}
MEDIA_TYPES = {'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac', 'm4a': 'audio/mp4', 'ogg': 'audio/ogg', 'mp4': 'video/mp4'}
FORMAT_MAP = {'mp3': ('mp3', ['-q:a', '2']), 'flac': ('flac', ['-compression_level', '5']), 'm4a': ('m4a', []), 'ogg': ('ogg', []), 'mp4': ('mp4', [])}
processing_status = {}
demucs_model = None
device = 'cuda' if torch.cuda.is_available() else 'cpu'

def normalize_audio(audio, max_threshold=0.99):
  max_val = audio.abs().max()
  return audio * (max_threshold / max_val) if max_val > max_threshold else audio

def load_demucs_model():
  global demucs_model
  if demucs_model is None:
    print(f"Loading Demucs model on {device}...")
    demucs_model = get_model('htdemucs_6s')
    demucs_model.to(device)
    print("Demucs model loaded successfully!")

def get_audio_info(temp_file_path):
  if not ESSENTIA_AVAILABLE:
    return {'key': '取得できませんでした', 'tempo': '取得できませんでした', 'duration': '取得できませんでした'}
  try:
    loader = es.MonoLoader(filename=temp_file_path)
    audio = loader()
    key, scale, _ = es.KeyExtractor()(audio)
    bpm, _, _, _, _ = es.RhythmExtractor2013(method="multifeature")(audio)
    percival_bpm = es.PercivalBpmEstimator()(audio)
    candidates = [b for base_bpm in [bpm, percival_bpm] 
      for b in [base_bpm, base_bpm * 2, base_bpm / 2, base_bpm * 1.5, base_bpm / 1.5] 
      if 60 <= b <= 300]
    if candidates:
      bpm = Counter([round(b) for b in candidates]).most_common(1)[0][0]
    return {'key': f'{key} {scale.upper()}', 'tempo': round(float(bpm), 1), 'duration': round(len(audio) / 44100.0, 1)}
  except Exception as e:
    print(f"Error getting audio info: {e}")
    return {'key': '取得できませんでした', 'tempo': '取得できませんでした', 'duration': '取得できませんでした'}

def load_waveform(temp_file, original_ext):
  if original_ext.lower() in AUDIO_EXTENSIONS:
    audio = AudioSegment.from_file(temp_file)
    wav_buffer = io.BytesIO()
    audio.export(wav_buffer, format='wav')
    wav_buffer.seek(0)
    return torchaudio.load(wav_buffer, backend='soundfile')
  return torchaudio.load(temp_file, backend='soundfile')

def demucs_separation(audio_data, job_id, original_ext):
  temp_file = None
  try:
    processing_status[job_id]['status'] = 'processing'
    processing_status[job_id]['progress'] = 0
    if demucs_model is None:
      load_demucs_model()
    processing_status[job_id]['progress'] = 5
    suffix = f'.{original_ext}' if original_ext else '.wav'
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
      tmp.write(audio_data)
      temp_file = tmp.name
    if original_ext.lower() == 'mp4':
      processing_status[job_id]['original_video_path'] = temp_file
    processing_status[job_id]['progress'] = 10
    info = get_audio_info(temp_file)
    processing_status[job_id]['progress'] = 15
    waveform, sr = load_waveform(temp_file, original_ext)
    processing_status[job_id]['progress'] = 25
    if waveform.shape[0] == 1:
      waveform = torch.cat([waveform, waveform], dim=0)
    if sr != demucs_model.samplerate:
      waveform = torchaudio.transforms.Resample(sr, demucs_model.samplerate)(waveform)
      sr = demucs_model.samplerate
    processing_status[job_id]['progress'] = 35
    waveform = normalize_audio(waveform, 1.0).to(device)
    with torch.no_grad():
      sources = apply_model(demucs_model, waveform[None], device=device)[0]
    processing_status[job_id]['progress'] = 70
    tracks = {}
    for i, name in enumerate(demucs_model.sources):
      buffer = io.BytesIO()
      torchaudio.save(buffer, normalize_audio(sources[i].cpu()), sr, format='wav', encoding='PCM_S', bits_per_sample=16, backend='soundfile')
      tracks[name] = buffer.getvalue()
      processing_status[job_id]['progress'] = 70 + (i + 1) * 5
    processing_status[job_id].update({'status': 'completed', 'progress': 100, 'tracks': tracks, 'audio_info': info, 'sample_rate': sr})
  except Exception as e:
    print(f"Job {job_id}: Error during separation: {str(e)}")
    processing_status[job_id] = {'status': 'error', 'error': str(e), 'progress': 0}
  finally:
    if temp_file and os.path.exists(temp_file) and original_ext.lower() != 'mp4':
      try:
        os.unlink(temp_file)
      except Exception:
        pass

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
  if not file.filename:
    raise HTTPException(status_code=400, detail="No file selected")
  ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
  if ext not in ALLOWED_EXTENSIONS:
    raise HTTPException(status_code=400, detail="Invalid file type")
  job_id = str(uuid.uuid4())
  processing_status[job_id] = {'filename': file.filename, 'status': 'processing', 'progress': 0, 'original_ext': ext}
  thread = threading.Thread(target=demucs_separation, args=(await file.read(), job_id, ext))
  thread.daemon = False
  thread.start()
  return {'job_id': job_id, 'filename': file.filename, 'status': 'uploaded', 'message': 'Processing started'}

@app.get("/status/{job_id}")
def status(job_id: str):
  if job_id not in processing_status:
    raise HTTPException(status_code=404, detail="Job not found")
  status_data = processing_status[job_id].copy()
  if 'tracks' in status_data:
    status_data['tracks_available'] = list(status_data['tracks'].keys())
    del status_data['tracks']
  return status_data

@app.get("/download/{job_id}/{track}")
def download(job_id: str, track: str):
  if job_id not in processing_status or processing_status[job_id]['status'] != 'completed':
    raise HTTPException(status_code=404 if job_id not in processing_status else 400, detail="Job not found" if job_id not in processing_status else "Processing not completed")
  if 'tracks' not in processing_status[job_id] or track not in processing_status[job_id]['tracks']:
    raise HTTPException(status_code=404, detail="Track not found")
  return Response(content=processing_status[job_id]['tracks'][track], media_type='audio/wav', headers={"Content-Disposition": f'attachment; filename="{track}.wav"'})

def generate_filename(volumes, base_name, ext):
  active_tracks = [track for track, volume in volumes.items() if volume > 0]
  if all(v == 1.0 for v in volumes.values()):
    return f"{base_name}.{ext}"
  if len(active_tracks) == 1:
    return f"{base_name} [{active_tracks[0]}].{ext}"
  if volumes.get('vocals', 0) == 0 and any(v > 0 for k, v in volumes.items() if k != 'vocals'):
    return f"{base_name} [instrumental].{ext}"
  return f"{base_name} [mixed].{ext}"

def create_response(content, ext, filename):
  return Response(content=content, media_type=MEDIA_TYPES.get(ext.lower(), 'audio/wav'), headers={"Content-Disposition": f"attachment; filename*=UTF-8''{urllib.parse.quote(filename.encode('utf-8'))}"})

def combine_video_audio(video_path, audio_path, output_path):
  try:
    subprocess.run(['ffmpeg', '-i', video_path, '-i', audio_path, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-y', output_path], check=True, capture_output=True)
    return True
  except Exception as e:
    print(f"Error combining video and audio: {e}")
    return False

@app.post("/mix/{job_id}")
async def mix_tracks(job_id: str, request: MixRequest):
  if job_id not in processing_status or processing_status[job_id]['status'] != 'completed':
    raise HTTPException(status_code=404 if job_id not in processing_status else 400, detail="Job not found" if job_id not in processing_status else "Processing not completed")
  volumes = request.volumes
  sr = processing_status[job_id]['sample_rate']
  mixed_audio = None
  for track_name, track_data in processing_status[job_id]['tracks'].items():
    waveform, _ = torchaudio.load(io.BytesIO(track_data), backend='soundfile')
    waveform = waveform * volumes.get(track_name, 1.0)
    mixed_audio = waveform if mixed_audio is None else mixed_audio + waveform
  buffer = io.BytesIO()
  torchaudio.save(buffer, normalize_audio(mixed_audio), sr, format='wav', encoding='PCM_S', bits_per_sample=16, backend='soundfile')
  wav_data = buffer.getvalue()
  original_ext = processing_status[job_id].get('original_ext', 'wav')
  base_name = processing_status[job_id]['filename'].rsplit('.', 1)[0] if '.' in processing_status[job_id]['filename'] else processing_status[job_id]['filename']
  if original_ext.lower() == 'mp4' and 'original_video_path' in processing_status[job_id]:
    original_video_path = processing_status[job_id]['original_video_path']
    if os.path.exists(original_video_path):
      try:
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as audio_tmp:
          audio_tmp.write(wav_data)
          audio_tmp_path = audio_tmp.name
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as output_tmp:
          output_path = output_tmp.name
        if combine_video_audio(original_video_path, audio_tmp_path, output_path):
          with open(output_path, 'rb') as f:
            mp4_data = f.read()
          try:
            os.unlink(audio_tmp_path)
            os.unlink(output_path)
          except Exception:
            pass
          return create_response(mp4_data, 'mp4', generate_filename(volumes, base_name, 'mp4'))
        try:
          os.unlink(audio_tmp_path)
          os.unlink(output_path)
        except Exception:
          pass
      except Exception as e:
        print(f"Error processing mp4 with video: {e}")
  if original_ext.lower() == 'wav':
    return create_response(wav_data, 'wav', generate_filename(volumes, base_name, 'wav'))
  try:
    audio = AudioSegment.from_wav(io.BytesIO(wav_data))
    output_buffer = io.BytesIO()
    if original_ext.lower() in FORMAT_MAP:
      fmt, params = FORMAT_MAP[original_ext.lower()]
      audio.export(output_buffer, format=fmt, bitrate='128k' if fmt != 'flac' else None, parameters=params if params else None)
      return create_response(output_buffer.getvalue(), original_ext, generate_filename(volumes, base_name, original_ext))
  except Exception as e:
    print(f"Error converting mixed audio to {original_ext}: {e}")
  return create_response(wav_data, 'wav', generate_filename(volumes, base_name, 'wav'))

@app.get("/health")
def health():
  return {'status': 'healthy', 'device': device, 'model_loaded': demucs_model is not None}

@app.delete("/clear/{job_id}")
def clear_job(job_id: str):
  if job_id in processing_status:
    if 'original_video_path' in processing_status[job_id]:
      try:
        os.unlink(processing_status[job_id]['original_video_path'])
      except Exception:
        pass
    del processing_status[job_id]
    return {'message': 'Job cleared'}
  raise HTTPException(status_code=404, detail="Job not found")

@app.on_event("startup")
async def startup_event():
  load_demucs_model()