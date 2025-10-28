from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import uuid
from werkzeug.utils import secure_filename
import threading
import io
import tempfile
import os
import torch
import torchaudio
from demucs.pretrained import get_model
from demucs.apply import apply_model
try:
  import essentia.standard as es
  ESSENTIA_AVAILABLE = True
except ModuleNotFoundError:
  ESSENTIA_AVAILABLE = False
from collections import Counter
import numpy as np

app = Flask(__name__)
CORS(app, expose_headers=['Content-Disposition'])

ALLOWED_EXTENSIONS = {'wav', 'mp3', 'flac', 'm4a', 'ogg'}
processing_status = {}
demucs_model = None
device = 'cuda' if torch.cuda.is_available() else 'cpu'

def load_demucs_model():
  global demucs_model
  if demucs_model is None:
    print(f"Loading Demucs model on {device}...")
    # htdemucs_ftを使う場合は htdemucs_6s をコメントし、htdemucs_ft のコメントを解除する。
    # htdemucs_ft の方が高品質だが、ピアノとギターのみの抽出ができない上、htdemucs_6s より4倍時間がかかる
    demucs_model = get_model('htdemucs_6s')
    # demucs_model = get_model('htdemucs_ft')
    demucs_model.to(device)
    print("Demucs model loaded successfully!")

def allowed_file(filename):
  return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def update_progress(job_id, progress):
  if job_id in processing_status:
    processing_status[job_id]['progress'] = min(progress, 100)

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
    
    return {
      'key': f'{key} {scale.upper()}', 
      'tempo': round(float(bpm), 1), 
      'duration': round(len(audio) / 44100.0, 1)
    }
  except Exception as e:
    print(f"Error getting audio info: {e}")
    return {'key': '取得できませんでした', 'tempo': '取得できませんでした', 'duration': '取得できませんでした'}

def demucs_separation(audio_data, job_id):
  temp_file = None
  try:
    processing_status[job_id]['status'] = 'processing'
    processing_status[job_id]['progress'] = 0
    
    if demucs_model is None:
      load_demucs_model()
    
    update_progress(job_id, 5)
    
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
      tmp.write(audio_data)
      temp_file = tmp.name
    
    update_progress(job_id, 10)
    info = get_audio_info(temp_file)
    update_progress(job_id, 15)
    
    waveform, sr = torchaudio.load(temp_file, backend='soundfile')
    update_progress(job_id, 25)
    
    if waveform.shape[0] == 1:
      waveform = torch.cat([waveform, waveform], dim=0)
    
    if sr != demucs_model.samplerate:
      waveform = torchaudio.transforms.Resample(sr, demucs_model.samplerate)(waveform)
      sr = demucs_model.samplerate
    
    update_progress(job_id, 35)
    
    max_val = waveform.abs().max()
    if max_val > 1.0:
      waveform = waveform / max_val
    
    waveform = waveform.to(device)
    
    with torch.no_grad():
      sources = apply_model(demucs_model, waveform[None], device=device)[0]
    
    update_progress(job_id, 70)
    
    tracks = {}
    for i, name in enumerate(demucs_model.sources):
      buffer = io.BytesIO()
      source_audio = sources[i].cpu()
      
      max_val = source_audio.abs().max()
      if max_val > 0.99:
        source_audio = source_audio * (0.99 / max_val)
      
      torchaudio.save(buffer, source_audio, sr, format='wav', encoding='PCM_S', bits_per_sample=16, backend='soundfile')
      tracks[name] = buffer.getvalue()
      update_progress(job_id, 70 + (i + 1) * 5)
    
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
      except Exception as e:
        print(f"Error deleting temp file: {e}")

@app.route('/upload', methods=['POST'])
def upload_file():
  if 'file' not in request.files:
    return jsonify({'error': 'No file provided'}), 400
  
  file = request.files['file']
  
  if file.filename == '' or not allowed_file(file.filename):
    return jsonify({'error': 'No file selected' if file.filename == '' else 'Invalid file type'}), 400
  
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
  active_tracks = [track for track, volume in volumes.items() if volume > 0]
  
  base_name, ext = original_filename.rsplit('.', 1)
  ext = f".{ext}"
  
  if all(v == 1.0 for v in volumes.values()):
    return f"{base_name}{ext}"
  
  if len(active_tracks) == 1:
    track_name = active_tracks[0]
    suffix_map = {
      'vocals': '[vocals]',
      'guitar': '[guitar]',
      'bass': '[bass]',
      'drums': '[drums]',
      'piano': '[piano]',
      'other': '[other]',
    }
    return f"{base_name} {suffix_map.get(track_name, '[mixed]')}{ext}"
  
  if volumes.get('vocals', 0) == 0 and any(v > 0 for k, v in volumes.items() if k != 'vocals'):
    return f"{base_name} [instrumental]{ext}"
  
  return f"{base_name} [mixed]{ext}"

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
    
    if mixed_audio is None:
      mixed_audio = waveform
    else:
      mixed_audio = mixed_audio + waveform
  
  max_val = mixed_audio.abs().max()
  if max_val > 0.99:
    mixed_audio = mixed_audio * (0.99 / max_val)
  
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
  app.run(debug=True, host='0.0.0.0', port=int(os.environ.get("PORT", 7860)), threaded=True)