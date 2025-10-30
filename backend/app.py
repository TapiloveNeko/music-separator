from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
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

try:
  import essentia.standard as es
  ESSENTIA_AVAILABLE = True
except ModuleNotFoundError:
  ESSENTIA_AVAILABLE = False

app = Flask(__name__)
CORS(app, expose_headers=['Content-Disposition'])

ALLOWED_EXTENSIONS = {'wav', 'mp3', 'flac', 'm4a', 'ogg'}
processing_status = {}
demucs_model = None
device = 'cuda' if torch.cuda.is_available() else 'cpu'

def normalize_audio(audio, max_threshold=0.99):
  """Normalize audio to prevent clipping."""
  max_val = audio.abs().max()
  if max_val > max_threshold:
    return audio * (max_threshold / max_val)
  return audio

def load_demucs_model():
  """Load the Demucs model for audio separation."""
  global demucs_model
  if demucs_model is None:
    print(f"Loading Demucs model on {device}...")
    # htdemucs_ftを使用する場合は、htdemucs_6s をコメントし、htdemucs_ftをコメント解除する
    # htdemucs_ft の方が品質が良いが、ギターとピアノのみの抽出ができない上、読み込みが htdemucs_6s の4倍時間がかかる
    demucs_model = get_model('htdemucs_6s')
    # demucs_model = get_model('htdemucs_ft')
    demucs_model.to(device)
    print("Demucs model loaded successfully!")

def get_audio_info(temp_file_path):
  """Extract audio information (key, tempo, duration) from audio file."""
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
    
    return {
      'key': f'{key} {scale.upper()}', 
      'tempo': round(float(bpm), 1), 
      'duration': round(len(audio) / 44100.0, 1)
    }
  except Exception as e:
    print(f"Error getting audio info: {e}")
    return {'key': '取得できませんでした', 'tempo': '取得できませんでした', 'duration': '取得できませんでした'}

def demucs_separation(audio_data, job_id):
  """Separate audio into individual tracks using Demucs."""
  temp_file = None
  try:
    processing_status[job_id]['status'] = 'processing'
    processing_status[job_id]['progress'] = 0
    
    if demucs_model is None:
      load_demucs_model()
    
    processing_status[job_id]['progress'] = 5
    
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
      tmp.write(audio_data)
      temp_file = tmp.name
    
    processing_status[job_id]['progress'] = 10
    info = get_audio_info(temp_file)
    processing_status[job_id]['progress'] = 15
    
    waveform, sr = torchaudio.load(temp_file, backend='soundfile')
    processing_status[job_id]['progress'] = 25
    
    if waveform.shape[0] == 1:
      waveform = torch.cat([waveform, waveform], dim=0)
    
    if sr != demucs_model.samplerate:
      waveform = torchaudio.transforms.Resample(sr, demucs_model.samplerate)(waveform)
      sr = demucs_model.samplerate
    
    processing_status[job_id]['progress'] = 35
    
    waveform = normalize_audio(waveform, 1.0)
    waveform = waveform.to(device)
    
    with torch.no_grad():
      sources = apply_model(demucs_model, waveform[None], device=device)[0]
    
    processing_status[job_id]['progress'] = 70
    
    tracks = {}
    for i, name in enumerate(demucs_model.sources):
      buffer = io.BytesIO()
      source_audio = normalize_audio(sources[i].cpu())
      torchaudio.save(buffer, source_audio, sr, format='wav', encoding='PCM_S', bits_per_sample=16, backend='soundfile')
      tracks[name] = buffer.getvalue()
      processing_status[job_id]['progress'] = 70 + (i + 1) * 5
    
    processing_status[job_id]['status'] = 'completed'
    processing_status[job_id]['progress'] = 100
    processing_status[job_id]['tracks'] = tracks
    processing_status[job_id]['audio_info'] = info
    processing_status[job_id]['sample_rate'] = sr
      
  except Exception as e:
    print(f"Job {job_id}: Error during separation: {str(e)}")
    processing_status[job_id] = {'status': 'error', 'error': str(e), 'progress': 0}
  finally:
    if temp_file and os.path.exists(temp_file):
      try:
        os.unlink(temp_file)
      except Exception:
        pass

@app.route('/upload', methods=['POST'])
def upload_file():
  if 'file' not in request.files:
    return jsonify({'error': 'No file provided'}), 400
  
  file = request.files['file']
  
  if not file.filename:
    return jsonify({'error': 'No file selected'}), 400
  
  if '.' not in file.filename or file.filename.rsplit('.', 1)[1].lower() not in ALLOWED_EXTENSIONS:
    return jsonify({'error': 'Invalid file type'}), 400
  
  job_id = str(uuid.uuid4())
  processing_status[job_id] = {'filename': file.filename, 'status': 'processing', 'progress': 0}
  
  thread = threading.Thread(target=demucs_separation, args=(file.read(), job_id))
  thread.daemon = False
  thread.start()
  
  return jsonify({'job_id': job_id, 'filename': file.filename, 'status': 'uploaded', 'message': 'Processing started'})

@app.route('/status/<job_id>', methods=['GET'])
def status(job_id):
  if job_id not in processing_status:
    return jsonify({'error': 'Job not found'}), 404
  
  status_data = processing_status[job_id].copy()
  if 'tracks' in status_data:
    status_data['tracks_available'] = list(status_data['tracks'].keys())
    del status_data['tracks']
  
  return jsonify(status_data)

@app.route('/download/<job_id>/<track>', methods=['GET'])
def download(job_id, track):
  if job_id not in processing_status:
    return jsonify({'error': 'Job not found'}), 404
  
  if processing_status[job_id]['status'] != 'completed':
    return jsonify({'error': 'Processing not completed'}), 400
  
  if 'tracks' not in processing_status[job_id] or track not in processing_status[job_id]['tracks']:
    return jsonify({'error': 'Track not found'}), 404
  
  return send_file(io.BytesIO(processing_status[job_id]['tracks'][track]), as_attachment=True, download_name=f'{track}.wav', mimetype='audio/wav')

def generate_filename(volumes, original_filename):
  """Generate filename based on active tracks and volumes."""
  active_tracks = [track for track, volume in volumes.items() if volume > 0]
  base_name, ext = original_filename.rsplit('.', 1)
  
  if all(v == 1.0 for v in volumes.values()):
    return f"{base_name}.{ext}"
  
  if len(active_tracks) == 1:
    return f"{base_name} [{active_tracks[0]}].{ext}"
  
  if volumes.get('vocals', 0) == 0 and any(v > 0 for k, v in volumes.items() if k != 'vocals'):
    return f"{base_name} [instrumental].{ext}"
  
  return f"{base_name} [mixed].{ext}"

@app.route('/mix/<job_id>', methods=['POST'])
def mix_tracks(job_id):
  if job_id not in processing_status:
    return jsonify({'error': 'Job not found'}), 404
  
  if processing_status[job_id]['status'] != 'completed':
    return jsonify({'error': 'Processing not completed'}), 400
  
  volumes = request.json.get('volumes', {})
  
  sr = processing_status[job_id]['sample_rate']
  mixed_audio = None
  
  for track_name, track_data in processing_status[job_id]['tracks'].items():
    volume = volumes.get(track_name, 1.0)
    waveform, _ = torchaudio.load(io.BytesIO(track_data), backend='soundfile')
    waveform = waveform * volume
    mixed_audio = waveform if mixed_audio is None else mixed_audio + waveform
  
  mixed_audio = normalize_audio(mixed_audio)
  
  buffer = io.BytesIO()
  torchaudio.save(buffer, mixed_audio, sr, format='wav', encoding='PCM_S', bits_per_sample=16, backend='soundfile')
  buffer.seek(0)
  
  original_filename = processing_status[job_id]['filename']
  download_name = generate_filename(volumes, original_filename)
  
  return send_file(buffer, as_attachment=True, download_name=download_name, mimetype='audio/wav')

@app.route('/health', methods=['GET'])
def health():
  return jsonify({'status': 'healthy', 'device': device, 'model_loaded': demucs_model is not None})

@app.route('/clear/<job_id>', methods=['DELETE'])
def clear_job(job_id):
  if job_id in processing_status:
    del processing_status[job_id]
    return jsonify({'message': 'Job cleared'})
  return jsonify({'error': 'Job not found'}), 404

if __name__ == '__main__':
  load_demucs_model()
  app.run(debug=True, host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), threaded=True)