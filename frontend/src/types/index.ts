export interface AudioTrack {
  id: string;
  name: string;
  color: string;
  volume: number;
  waveform: number[];
  audioBuffer?: AudioBuffer;
}

export interface ProcessingStatus {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  jobId?: string;
  error?: string;
}

export interface AudioInfo {
  key: string;
  tempo: number;
  duration: number;
}

export interface UploadResponse {
  job_id: string;
  filename: string;
  status: string;
}

export interface StatusResponse {
  status: 'processing' | 'completed' | 'error';
  progress: number;
  audio_info?: AudioInfo;
  output_dir?: string;
  error?: string;
}

export interface AppState {
  currentFile: File | null;
  processingStatus: ProcessingStatus;
  audioInfo: AudioInfo | null;
  tracks: AudioTrack[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

