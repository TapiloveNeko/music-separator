from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import uuid
from werkzeug.utils import secure_filename
import librosa
import numpy as np
import threading
import io
import tempfile
import os
import torch
import torchaudio
from demucs.pretrained import get_model
from demucs.apply import apply_model

app = Flask(__name__)
# Hugging Face Spaces: GitHub Pagesからのアクセスを許可するためCORSを有効化
CORS(app)

ALLOWED_EXTENSIONS = {'wav', 'mp3', 'flac', 'm4a', 'ogg'}

processing_status = {}

demucs_model = None
device = 'cuda' if torch.cuda.is_available() else 'cpu'

def load_demucs_model():
    global demucs_model
    if demucs_model is None:
        print(f"Loading Demucs model on {device}...")
        # htdemucs_6sの記述
        demucs_model = get_model('htdemucs_6s')
        # htdemucs_ftの記述
        # demucs_model = get_model('htdemucs_ft')
        demucs_model.to(device)
        print("Demucs model loaded successfully!")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def update_progress(job_id, progress):
    if job_id in processing_status:
        processing_status[job_id]['progress'] = min(progress, 100)

def get_audio_info(temp_file_path):
    try:
        waveform, sr = torchaudio.load(temp_file_path, backend='soundfile')
        
        if waveform.shape[0] > 1:
            mono = waveform.mean(dim=0)
        else:
            mono = waveform[0]
        
        y = mono.numpy()
        
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        key_index = int(np.argmax(chroma.mean(axis=1)))
        keys = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
        key = keys[key_index % 12]
        
        major_profile = np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1])
        minor_profile = np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0])
        
        chroma_mean = chroma.mean(axis=1)
        major_correlation = np.corrcoef(chroma_mean, np.roll(major_profile, key_index))[0, 1]
        minor_correlation = np.corrcoef(chroma_mean, np.roll(minor_profile, key_index))[0, 1]
        
        mode = 'MAJOR' if major_correlation > minor_correlation else 'MINOR'
        
        duration = waveform.shape[1] / sr
        
        return {'key': f'{key} {mode}', 'tempo': round(float(tempo), 1), 'duration': round(duration, 1)}
    except Exception as e:
        print(f"Error getting audio info: {e}")
        return {
            'key': '取得できませんでした', 
            'tempo': '取得できませんでした', 
            'duration': '取得できませんでした'
        }

def demucs_separation(audio_data, job_id):
    temp_file = None
    try:
        processing_status[job_id] = {'status': 'processing', 'progress': 0}
        
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
            resampler = torchaudio.transforms.Resample(sr, demucs_model.samplerate)
            waveform = resampler(waveform)
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
        source_names = demucs_model.sources
        
        for i, name in enumerate(source_names):
            buffer = io.BytesIO()
            source_audio = sources[i].cpu()
            
            max_val = source_audio.abs().max()
            if max_val > 0.99:
                source_audio = source_audio * (0.99 / max_val)
            
            torchaudio.save(buffer, source_audio, sr, format='wav', encoding='PCM_S', bits_per_sample=16, backend='soundfile')
            tracks[name] = buffer.getvalue()
            update_progress(job_id, 70 + (i + 1) * 5)
        
        update_progress(job_id, 100)
        
        processing_status[job_id] = {
            'status': 'completed',
            'progress': 100,
            'tracks': tracks,
            'audio_info': info
        }
        
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
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        job_id = str(uuid.uuid4())
        audio_data = file.read()
        
        thread = threading.Thread(target=demucs_separation, args=(audio_data, job_id))
        thread.daemon = False
        thread.start()
        
        return jsonify({
            'job_id': job_id, 
            'filename': filename, 
            'status': 'uploaded',
            'message': 'Processing started'
        })
    
    return jsonify({'error': 'Invalid file type'}), 400

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
    
    track_data = processing_status[job_id]['tracks'][track]
    
    return send_file(
        io.BytesIO(track_data), 
        as_attachment=True, 
        download_name=f'{track}.wav',
        mimetype='audio/wav'
    )

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'device': device,
        'model_loaded': demucs_model is not None
    })

@app.route('/clear/<job_id>', methods=['DELETE'])
def clear_job(job_id):
    if job_id in processing_status:
        del processing_status[job_id]
        return jsonify({'message': 'Job cleared'})
    return jsonify({'error': 'Job not found'}), 404

if __name__ == '__main__':
    load_demucs_model()
    
    # Hugging Face Spaces: ポート7860を使用（HF Spacesのデフォルト）
    port = int(os.environ.get("PORT", 7860))
    # Hugging Face Spaces: 本番環境なのでdebug=Falseに設定
    app.run(debug=False, host='0.0.0.0', port=port, threaded=True)