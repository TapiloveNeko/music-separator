export interface AudioTrack {
  id: string;
  name: string;
  color: string;
  volume: number;
  waveform: number[];
  audioBuffer?: AudioBuffer;
}

// 分離ジョブ（アップロード〜分離〜ダウンロード）の進捗。表示中の曲とは独立していて、別の曲を聴いている間も裏で進む
export interface ProcessingStatus {
  status: 'idle' | 'uploading' | 'processing' | 'error';
  progress: number;
  message: string;
  jobId?: string;
  fileName?: string;
  error?: string;
}

// 画面上部に一時的に出すお知らせ（分離完了など）
export interface Notice {
  kind: 'success' | 'error';
  message: string;
  // true のとき「開く」ボタンを出し、分離が完了した曲を開けるようにする
  canOpenCompletedSong?: boolean;
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
  status: 'processing' | 'completed' | 'error' | 'cancelled';
  progress: number;
  audio_info?: AudioInfo;
  output_dir?: string;
  error?: string;
}

// ブラウザに保存した曲の情報（音声データは含まない）。曲一覧の表示にも使う
export interface SavedSong {
  id: string; // バックエンドの job_id をそのまま使う
  fileName: string;
  fileSize: number;
  createdAt: number;
  audioInfo: AudioInfo | null;
  volumes: { [trackId: string]: number };
  // 曲を開くたびに音声を解析し直さなくて済むよう、波形と曲の長さも保存する（古い保存データには無い）
  waveforms?: { [trackId: string]: number[] };
  duration?: number;
  // ブラウザに保存した音声データの合計サイズ（バイト）
  storedSize?: number;
}

export interface AppState {
  // ブラウザに保存されている曲の一覧（新しい順）
  songs: SavedSong[];
  // 現在表示している曲のID（= job_id）。アップロード画面のときは null
  currentSongId: string | null;
  // 分離した曲をブラウザに保存できなかったときに画面に出すメッセージ
  saveError: string | null;
  notice: Notice | null;
  // 保存済みの曲を読み込んでいる最中か（この間にアップロード画面が一瞬表示されるのを防ぐ）
  isRestoring: boolean;
  currentFile: File | null;
  // リロード後は File オブジェクトを復元できないため、表示用のファイル名は別に持つ
  currentFileName: string | null;
  processingStatus: ProcessingStatus;
  audioInfo: AudioInfo | null;
  tracks: AudioTrack[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  dragPosition: number | null;
  isDragging: boolean;
}