import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { AppState, ProcessingStatus, AudioTrack, AudioInfo, SavedSong } from '../types';
import { uploadFile, getStatus, downloadTrack, mixTracks, isNotFoundError } from '../services/api';
import {
  StoredSong,
  TrackBlobs,
  PendingJob,
  saveSong,
  getSong,
  getSongTracks,
  listSongs,
  getTotalBlobSize,
  updateSong,
  deleteSong,
  requestPersistentStorage,
  getPendingJob,
  setPendingJob,
  getCurrentSongId,
  setCurrentSongId,
  MAX_SONGS,
} from '../services/storage';

interface AudioContextType {
  state: AppState;
  uploadAudioFile: (file: File) => Promise<void>;
  togglePlayback: () => void;
  updateTrackVolume: (trackId: string, volume: number) => void;
  seekTo: (time: number) => void;
  exportTracks: () => Promise<void>;
  resetApp: () => void;
  dismissSaveError: () => void;
  selectSong: (songId: string) => void;
  removeSong: (songId: string) => Promise<void>;
  setDragPosition: (position: number | null) => void;
  setIsDragging: (isDragging: boolean) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

// htdemucs_ftを使用する場合は、guitar と piano をコメントする
// htdemucs_ft の方が品質が良いが、ギターとピアノのみの抽出ができない上、読み込みが htdemucs_6s の4倍時間がかかる
const initialTracks: AudioTrack[] = [
  { id: 'vocals', name: 'ボーカル', color: '#f1c40f', volume: 100, waveform: [] },
  { id: 'guitar', name: 'ギター', color: '#e74c3c', volume: 100, waveform: [] },
  { id: 'bass', name: 'ベース', color: '#3498db', volume: 100, waveform: [] },
  { id: 'drums', name: 'ドラム', color: '#2ecc71', volume: 100, waveform: [] },
  { id: 'piano', name: 'ピアノ', color: '#ec4899', volume: 100, waveform: [] },
  { id: 'other', name: 'その他', color: '#9b59b6', volume: 100, waveform: [] },
];

const initialState: AppState = {
  songs: [],
  currentSongId: null,
  saveError: null,
  isRestoring: false,
  currentFile: null,
  currentFileName: null,
  processingStatus: {
    status: 'idle',
    progress: 0,
    message: '',
  },
  audioInfo: null,
  tracks: initialTracks,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  dragPosition: null,
  isDragging: false,
};

type AudioAction =
  | { type: 'SET_FILE'; payload: File }
  | { type: 'SET_FILE_NAME'; payload: string }
  | { type: 'SET_PROCESSING_STATUS'; payload: ProcessingStatus }
  | { type: 'SET_AUDIO_INFO'; payload: AudioInfo }
  | { type: 'UPDATE_TRACK'; payload: { trackId: string; updates: Partial<AudioTrack> } }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_CURRENT_TIME'; payload: number }
  | { type: 'SET_DURATION'; payload: number }
  | { type: 'SET_DRAG_POSITION'; payload: number | null }
  | { type: 'SET_IS_DRAGGING'; payload: boolean }
  | { type: 'SET_SONGS'; payload: SavedSong[] }
  | { type: 'SET_SAVE_ERROR'; payload: string | null }
  | { type: 'SET_CURRENT_SONG_ID'; payload: string | null }
  | { type: 'SET_RESTORING'; payload: boolean }
  | { type: 'RESET' };

const audioReducer = (state: AppState, action: AudioAction): AppState => {
  switch (action.type) {
    case 'SET_FILE':
      return { ...state, currentFile: action.payload, currentFileName: action.payload.name };
    case 'SET_FILE_NAME':
      return { ...state, currentFileName: action.payload };
    case 'SET_PROCESSING_STATUS':
      return { ...state, processingStatus: action.payload };
    case 'SET_AUDIO_INFO':
      return { ...state, audioInfo: action.payload };
    case 'UPDATE_TRACK':
      return {
        ...state,
        tracks: state.tracks.map(track =>
          track.id === action.payload.trackId
            ? { ...track, ...action.payload.updates }
            : track
        ),
      };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload };
    case 'SET_CURRENT_TIME':
      return { ...state, currentTime: action.payload };
    case 'SET_DURATION':
      return { ...state, duration: action.payload };
    case 'SET_DRAG_POSITION':
      return { ...state, dragPosition: action.payload };
    case 'SET_IS_DRAGGING':
      return { ...state, isDragging: action.payload };
    case 'SET_SONGS':
      return { ...state, songs: action.payload };
    case 'SET_SAVE_ERROR':
      return { ...state, saveError: action.payload };
    case 'SET_CURRENT_SONG_ID':
      return { ...state, currentSongId: action.payload };
    case 'SET_RESTORING':
      return { ...state, isRestoring: action.payload };
    case 'RESET':
      // 表示中の曲だけを初期化し、曲一覧は残す
      return { ...initialState, songs: state.songs };
    default:
      return state;
  }
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // リロード直後に保存済みの曲を開く場合は、最初から「読み込み中」にしておく（アップロード画面のちらつき防止）
  const [state, dispatch] = useReducer(audioReducer, initialState, init => ({
    ...init,
    isRestoring: !getPendingJob() && !!getCurrentSongId(),
  }));
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const mediaSourceNodesRef = useRef<Map<string, MediaElementAudioSourceNode>>(new Map());
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const animationFrameRef = useRef<number | undefined>(undefined);
  const tracksRef = useRef<AudioTrack[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const durationRef = useRef<number>(0);
  // 現在表示している曲の保存ID（= job_id）。ブラウザに保存されていない曲では null
  const songIdRef = useRef<string | null>(null);
  const restoreStartedRef = useRef<boolean>(false);

  useEffect(() => {
    tracksRef.current = state.tracks;
  }, [state.tracks]);

  useEffect(() => {
    isPlayingRef.current = state.isPlaying;
  }, [state.isPlaying]);

  useEffect(() => {
    durationRef.current = state.duration;
  }, [state.duration]);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const stopAllTracks = useCallback(() => {
    audioElementsRef.current.forEach(audio => {
      audio.pause();
    });
  }, []);

  const playAllTracks = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    audioElementsRef.current.forEach(audio => {
      audio.play().catch(e => console.error('Play error:', e));
    });
  }, []);

  const startTimeUpdate = useCallback(() => {
    const updateTime = () => {
      const firstAudio = Array.from(audioElementsRef.current.values())[0];
      if (!firstAudio) return;

      const currentTime = firstAudio.currentTime;
      dispatch({ type: 'SET_CURRENT_TIME', payload: currentTime });

      if (currentTime >= durationRef.current && isPlayingRef.current) {
        dispatch({ type: 'SET_PLAYING', payload: false });
      } else {
        animationFrameRef.current = requestAnimationFrame(updateTime);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateTime);
  }, []);

  const stopTimeUpdate = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  const getProgressMessage = (progress: number): string => {
    if (progress >= 0 && progress <= 2) {
      return '音楽ファイルをサーバーに書き込み中';
    } else if (progress === 3) {
      return '音楽ファイルをサーバーに書き込み完了';
    } else if (progress >= 4 && progress <= 5) {
      return '音楽ファイル情報（Key、BPM、曲の長さ）取得中';
    } else if (progress === 6) {
      return '音楽ファイル情報（Key、BPM、曲の長さ）取得完了';
    } else if (progress >= 7 && progress <= 9) {
      return '音楽ファイル読み込み、ステレオ・サンプルレート変換中';
    } else if (progress === 10) {
      return '音楽ファイル読み込み、ステレオ・サンプルレート変換完了';
    } else if (progress >= 11 && progress <= 87) {
      return '音楽ファイル分離処理中';
    } else if (progress === 100) {
      return '読み込み完了';
    }
    return '';
  };

  useEffect(() => {
    if (state.isPlaying) {
      playAllTracks();
      startTimeUpdate();
    } else {
      stopAllTracks();
      stopTimeUpdate();
    }

    return () => {
      stopTimeUpdate();
    };
  }, [state.isPlaying, playAllTracks, startTimeUpdate, stopAllTracks, stopTimeUpdate]);

  useEffect(() => {
    state.tracks.forEach(track => {
      const gainNode = gainNodesRef.current.get(track.id);
      if (gainNode) {
        gainNode.gain.value = track.volume / 100;
      }
    });
  }, [state.tracks]);

  const seekTo = useCallback((time: number) => {
    const clampedTime = Math.max(0, Math.min(time, state.duration));
    
    audioElementsRef.current.forEach(audio => {
      audio.currentTime = clampedTime;
    });
    
    dispatch({ type: 'SET_CURRENT_TIME', payload: clampedTime });
  }, [state.duration]);

  const setErrorStatus = (message: string, error: unknown) => {
    dispatch({
      type: 'SET_PROCESSING_STATUS',
      payload: {
        status: 'error',
        progress: 0,
        message,
        error: error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error',
      },
    });
  };

  // 表示中の曲のIDを、非同期処理用の ref・画面表示用の state・リロード用の localStorage にそろえて設定する
  const setActiveSongId = (songId: string | null) => {
    songIdRef.current = songId;
    dispatch({ type: 'SET_CURRENT_SONG_ID', payload: songId });
    setCurrentSongId(songId);
  };

  // 曲一覧を IndexedDB から読み直す
  const refreshSongs = async () => {
    try {
      dispatch({ type: 'SET_SONGS', payload: await listSongs() });
    } catch (error) {
      console.warn('曲一覧を読み込めませんでした:', error);
    }
  };

  // 分離が完了した曲をブラウザ（IndexedDB）に保存する。容量不足などで保存できなくても、表示・再生はそのまま続ける
  const persistSong = async (song: StoredSong, trackBlobs: TrackBlobs) => {
    setPendingJob(null);
    try {
      await saveSong(song, trackBlobs);
      setActiveSongId(song.id);
      await refreshSongs();
    } catch (error) {
      console.warn('曲をブラウザに保存できませんでした:', error);
      // 容量不足は QuotaExceededError になる。ブラウザによっては原因不明（UnknownError）として返ることもあるため同じ扱いにする
      const isStorageFull =
        error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'UnknownError');
      dispatch({
        type: 'SET_SAVE_ERROR',
        payload: isStorageFull
          ? '容量が不足しているため、この曲は保存されませんでした。不要な曲を削除するか、端末の空き容量を増やしてください。'
          : 'この曲はブラウザに保存されませんでした。リロードしたり別の曲に切り替えたりすると、この曲は表示されなくなります。',
      });
    }
  };

  // バックエンドの処理状況を1秒ごとに確認する。アップロード直後と、分離途中でリロードしたときの両方から呼ばれる
  const pollJob = (job: PendingJob) => {
    const checkStatus = async () => {
      try {
        const status = await getStatus(job.jobId);

        if (status.status === 'completed') {
          dispatch({
            type: 'SET_PROCESSING_STATUS',
            payload: {
              status: 'processing',
              progress: 88,
              message: 'トラック読み込み開始',
              jobId: job.jobId,
            },
          });

          if (status.audio_info) {
            dispatch({ type: 'SET_AUDIO_INFO', payload: status.audio_info });
          }

          const { trackBlobs, waveforms, duration } = await loadSeparatedTracks(
            job.jobId,
            trackId => downloadTrack(job.jobId, trackId),
            'ダウンロード中',
          );

          await persistSong(
            {
              id: job.jobId,
              fileName: job.fileName,
              fileSize: job.fileSize,
              createdAt: Date.now(),
              audioInfo: status.audio_info ?? null,
              volumes: tracksRef.current.reduce<{ [trackId: string]: number }>((acc, track) => {
                acc[track.id] = track.volume;
                return acc;
              }, {}),
              waveforms,
              duration,
              storedSize: getTotalBlobSize(trackBlobs),
            },
            trackBlobs,
          );

          dispatch({
            type: 'SET_PROCESSING_STATUS',
            payload: {
              status: 'completed',
              progress: 100,
              message: '処理完了！',
              jobId: job.jobId,
            },
          });
        } else if (status.status === 'processing') {
          const currentProgress = Math.min(status.progress, 87);
          dispatch({
            type: 'SET_PROCESSING_STATUS',
            payload: {
              status: status.status,
              progress: currentProgress,
              message: getProgressMessage(currentProgress),
              jobId: job.jobId,
            },
          });
          setTimeout(checkStatus, 1000);
        } else {
          setPendingJob(null);
          setErrorStatus('処理に失敗しました', status.error || '分離処理中にエラーが発生しました');
        }
      } catch (error) {
        if (isNotFoundError(error)) {
          // サーバーの再起動・スリープでジョブが消えた場合。再試行しても戻らないので保存情報も消す
          setPendingJob(null);
          setErrorStatus(
            '処理に失敗しました',
            'サーバーが再起動したため、処理中のデータが失われました。もう一度アップロードしてください。',
          );
        } else {
          // 通信エラーなどの一時的な失敗。ジョブ情報は残し、リロードで再確認できるようにする
          setErrorStatus('処理に失敗しました', error);
        }
      }
    };

    checkStatus();
  };

  const uploadAudioFile = async (file: File) => {
    if (state.songs.length >= MAX_SONGS) return;
    try {
      dispatch({ type: 'SET_FILE', payload: file });
      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: { status: 'uploading', progress: 0, message: 'アップロード中' },
      });

      const uploadResponse = await uploadFile(file);
      const job: PendingJob = { jobId: uploadResponse.job_id, fileName: file.name, fileSize: file.size };
      // 分離途中でリロードしても処理状況の確認を再開できるよう、ジョブ情報を保存しておく
      setPendingJob(job);

      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: {
          status: 'processing',
          progress: 0,
          message: getProgressMessage(0),
          jobId: job.jobId,
        },
      });

      pollJob(job);
    } catch (error) {
      setErrorStatus('アップロードに失敗しました', error);
    }
  };

  // ブラウザに保存されている曲を読み込み、分離直後と同じ状態に戻す
  const restoreSong = async (songId: string) => {
    dispatch({ type: 'SET_RESTORING', payload: true });
    try {
      const song = await getSong(songId);
      const trackBlobs = song && (await getSongTracks(songId));
      if (!song || !trackBlobs) {
        setActiveSongId(null);
        return;
      }
      const getStoredBlob = (trackId: string): Blob => {
        const blob = trackBlobs[trackId];
        if (!blob) throw new Error(`${trackId} のデータが保存されていません`);
        return blob;
      };

      setActiveSongId(song.id);
      // サイズを記録していなかった古いデータは、ここで記録して一覧に表示できるようにする
      if (song.storedSize === undefined) {
        updateSong(song.id, { storedSize: getTotalBlobSize(trackBlobs) })
          .then(refreshSongs)
          .catch(error => console.warn('サイズを保存できませんでした:', error));
      }
      dispatch({ type: 'SET_FILE_NAME', payload: song.fileName });
      if (song.audioInfo) {
        dispatch({ type: 'SET_AUDIO_INFO', payload: song.audioInfo });
      }
      Object.entries(song.volumes).forEach(([trackId, volume]) => {
        dispatch({ type: 'UPDATE_TRACK', payload: { trackId, updates: { volume } } });
      });

      const { waveforms, duration } = song;
      if (waveforms && duration) {
        // 波形と曲の長さが保存されていれば、音声を解析し直さずに即座に表示する（再生の準備は裏で進む）
        initialTracks.forEach(track => {
          attachTrackAudio(track.id, getStoredBlob(track.id), song.volumes[track.id] ?? track.volume);
          dispatch({ type: 'UPDATE_TRACK', payload: { trackId: track.id, updates: { waveform: waveforms[track.id] ?? [] } } });
        });
        dispatch({ type: 'SET_DURATION', payload: duration });
      } else {
        // 波形を保存していなかった古いデータは、1回だけ解析して波形を保存する（次回からは即時表示になる）
        dispatch({
          type: 'SET_PROCESSING_STATUS',
          payload: {
            status: 'processing',
            progress: 88,
            message: '保存された曲を読み込み中',
            jobId: song.id,
          },
        });
        const loaded = await loadSeparatedTracks(
          song.id,
          async trackId => getStoredBlob(trackId),
          '読み込み中',
          song.volumes,
        );
        updateSong(song.id, { waveforms: loaded.waveforms, duration: loaded.duration }).catch(error =>
          console.warn('波形を保存できませんでした:', error),
        );
      }

      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: {
          status: 'completed',
          progress: 100,
          message: '処理完了！',
          jobId: song.id,
        },
      });
    } catch (error) {
      console.error('Failed to restore song:', error);
      // 壊れたデータを残すと毎回失敗するため削除する
      unloadCurrentSong();
      deleteSong(songId)
        .catch(() => {})
        .then(refreshSongs);
      setErrorStatus('保存された曲を読み込めませんでした', error);
    } finally {
      dispatch({ type: 'SET_RESTORING', payload: false });
    }
  };

  // 起動時（リロード時）に、分離途中のジョブか保存済みの曲があれば復元する
  useEffect(() => {
    // StrictMode では effect が2回実行されるため、2回目は何もしない
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;

    requestPersistentStorage();
    refreshSongs();

    const pendingJob = getPendingJob();
    if (pendingJob) {
      dispatch({ type: 'SET_FILE_NAME', payload: pendingJob.fileName });
      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: {
          status: 'processing',
          progress: 0,
          message: '処理状況を確認中',
          jobId: pendingJob.jobId,
        },
      });
      pollJob(pendingJob);
      return;
    }

    const songId = getCurrentSongId();
    if (songId) {
      restoreSong(songId);
    }
    // 起動時に1回だけ実行したいので依存配列は空にする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 音量を変えたら保存する（スライダー操作中に何度も書き込まないよう少し待つ）
  useEffect(() => {
    const songId = songIdRef.current;
    if (!songId || state.processingStatus.status !== 'completed') return;

    const volumes = state.tracks.reduce<{ [trackId: string]: number }>((acc, track) => {
      acc[track.id] = track.volume;
      return acc;
    }, {});
    const timer = setTimeout(() => {
      updateSong(songId, { volumes }).catch(error => console.warn('音量を保存できませんでした:', error));
    }, 500);

    return () => clearTimeout(timer);
  }, [state.tracks, state.processingStatus.status]);

  // 1トラック分の音声を再生できるようにつなぐ（<audio> → 音量調整 → スピーカー）。音声の解析はしないので一瞬で終わる
  const attachTrackAudio = (trackId: string, blob: Blob, volume: number): HTMLAudioElement => {
    const audioContext = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();

    const audio = new Audio(URL.createObjectURL(blob));
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';

    const mediaSource = audioContext.createMediaElementSource(audio);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume / 100;

    mediaSource.connect(gainNode);
    gainNode.connect(audioContext.destination);

    audioElementsRef.current.set(trackId, audio);
    mediaSourceNodesRef.current.set(trackId, mediaSource);
    gainNodesRef.current.set(trackId, gainNode);

    return audio;
  };

  // 各トラックの音声を読み込み、波形を作って再生できる状態にする。音声データの取得元（サーバー or ブラウザ保存）は getTrackBlob で切り替える。
  // 音声の解析（decodeAudioData）は重いため、ここで作った波形と曲の長さは保存して、次回からは使い回す
  const loadSeparatedTracks = async (
    jobId: string,
    getTrackBlob: (trackId: string) => Promise<Blob>,
    loadingLabel: string,
    volumes?: { [trackId: string]: number },
  ): Promise<{ trackBlobs: TrackBlobs; waveforms: { [trackId: string]: number[] }; duration: number }> => {
    const audioContext = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
    let maxDuration = 0;
    let completedItems = 0;
    const trackBlobs: TrackBlobs = {};
    const waveforms: { [trackId: string]: number[] } = {};

    for (const track of initialTracks) {
      completedItems++;
      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: {
          status: 'processing',
          progress: 87 + completedItems,
          message: `${track.name}${loadingLabel}`,
          jobId: jobId,
        },
      });

      const audioBlob = await getTrackBlob(track.id);
      trackBlobs[track.id] = audioBlob;
      attachTrackAudio(track.id, audioBlob, volumes?.[track.id] ?? track.volume);

      completedItems++;
      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: {
          status: 'processing',
          progress: 87 + completedItems,
          message: `${track.name}の波形を作成中`,
          jobId: jobId,
        },
      });

      // 解析結果（AudioBuffer）は1曲で数百MBになるため保持せず、波形と長さだけを取り出す
      const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
      maxDuration = Math.max(maxDuration, audioBuffer.duration);
      waveforms[track.id] = generateWaveform(audioBuffer);

      dispatch({
        type: 'UPDATE_TRACK',
        payload: {
          trackId: track.id,
          updates: { waveform: waveforms[track.id] },
        },
      });
    }

    dispatch({ type: 'SET_DURATION', payload: maxDuration });

    dispatch({
      type: 'SET_PROCESSING_STATUS',
      payload: {
        status: 'processing',
        progress: 100,
        message: getProgressMessage(100),
        jobId: jobId,
      },
    });

    return { trackBlobs, waveforms, duration: maxDuration };
  };

  const generateWaveform = (audioBuffer: AudioBuffer): number[] => {
    const data = audioBuffer.getChannelData(0);
    const samples = 1000;
    const blockSize = Math.floor(data.length / samples);
    const waveform: number[] = [];
    
    for (let i = 0; i < samples; i++) {
      const start = i * blockSize;
      const end = start + blockSize;
      let sum = 0;
      
      for (let j = start; j < end; j++) {
        sum += Math.abs(data[j]);
      }
      
      waveform.push(sum / blockSize);
    }
    
    return waveform;
  };

  const togglePlayback = () => {
    const hasLoadedTracks = audioElementsRef.current.size > 0;
    
    if (!hasLoadedTracks) {
      console.warn('No audio tracks loaded yet');
      return;
    }

    dispatch({ type: 'SET_PLAYING', payload: !state.isPlaying });
  };

  const updateTrackVolume = (trackId: string, volume: number) => {
    dispatch({
      type: 'UPDATE_TRACK',
      payload: { trackId, updates: { volume } },
    });
  };

  const exportTracks = async () => {
    if (!state.processingStatus.jobId) return;
    
    try {
      const volumes: { [key: string]: number } = {};
      state.tracks.forEach(track => {
        volumes[track.id] = track.volume / 100;
      });

      const { blob, filename } = await mixTracks(state.processingStatus.jobId, volumes);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      // ミックスはサーバー側のデータを使うため、サーバー再起動後はブラウザに曲が残っていても保存できない
      window.alert(
        isNotFoundError(error)
          ? 'サーバーが再起動したため、この曲は保存（ミックスのダウンロード）ができません。再生・音量調整はそのまま使えます。保存したい場合は、もう一度アップロードしてください。'
          : '保存に失敗しました。時間をおいて再度お試しください。',
      );
    }
  };

  // 表示中の曲を画面から外す（ブラウザの保存データは残す）
  const unloadCurrentSong = () => {
    stopAllTracks();
    stopTimeUpdate();

    audioElementsRef.current.forEach(audio => {
      audio.pause();
      const objectUrl = audio.src;
      audio.src = '';
      if (objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(objectUrl);
      }
    });

    mediaSourceNodesRef.current.forEach(node => node.disconnect());
    gainNodesRef.current.forEach(node => node.disconnect());

    audioElementsRef.current.clear();
    mediaSourceNodesRef.current.clear();
    gainNodesRef.current.clear();

    setActiveSongId(null);
    setPendingJob(null);
    dispatch({ type: 'RESET' });
  };

  // 分離中・読み込み中は、表示中の曲を切り替えられないようにする
  const isBusy = () =>
    state.isRestoring || state.processingStatus.status === 'uploading' || state.processingStatus.status === 'processing';

  // 「新しい曲を選択」：表示中の曲を外してアップロード画面に戻る（曲は一覧に残る）
  const resetApp = () => {
    if (isBusy()) return;
    unloadCurrentSong();
  };

  // 曲一覧から曲を選んで表示する
  const selectSong = (songId: string) => {
    if (isBusy() || songId === songIdRef.current) return;
    unloadCurrentSong();
    restoreSong(songId);
  };

  // 曲一覧から曲を削除する。表示中の曲なら画面からも外す
  const removeSong = async (songId: string) => {
    if (isBusy()) return;
    if (songId === songIdRef.current) {
      unloadCurrentSong();
    }
    try {
      await deleteSong(songId);
    } catch (error) {
      console.warn('保存データを削除できませんでした:', error);
    }
    await refreshSongs();
  };

  const dismissSaveError = () => {
    dispatch({ type: 'SET_SAVE_ERROR', payload: null });
  };

  const setDragPosition = (position: number | null) => {
    dispatch({ type: 'SET_DRAG_POSITION', payload: position });
  };

  const setIsDragging = (isDragging: boolean) => {
    dispatch({ type: 'SET_IS_DRAGGING', payload: isDragging });
  };

  return (
    <AudioContext.Provider
      value={{
        state,
        uploadAudioFile,
        togglePlayback,
        updateTrackVolume,
        seekTo,
        exportTracks,
        resetApp,
        dismissSaveError,
        selectSong,
        removeSong,
        setDragPosition,
        setIsDragging,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};