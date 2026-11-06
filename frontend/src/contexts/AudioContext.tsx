import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { AppState, ProcessingStatus, AudioTrack, AudioInfo, SavedSong, Notice } from '../types';
import {
  uploadFile,
  getStatus,
  downloadTrack,
  mixTracks,
  cancelJob as requestCancelJob,
  isNotFoundError,
  isCanceledRequest,
} from '../services/api';
import {
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
  cancelJob: () => void;
  togglePlayback: () => void;
  updateTrackVolume: (trackId: string, volume: number) => void;
  seekTo: (time: number) => void;
  exportTracks: () => Promise<void>;
  resetApp: () => void;
  dismissSaveError: () => void;
  dismissNotice: () => void;
  openCompletedSong: () => void;
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

const idleStatus: ProcessingStatus = {
  status: 'idle',
  progress: 0,
  message: '',
};

const initialState: AppState = {
  songs: [],
  currentSongId: null,
  isRestoring: false,
  saveError: null,
  notice: null,
  currentFile: null,
  currentFileName: null,
  processingStatus: idleStatus,
  audioInfo: null,
  tracks: initialTracks,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  dragPosition: null,
  isDragging: false,
};

type AudioAction =
  | { type: 'SET_FILE'; payload: File | null }
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
  | { type: 'SET_NOTICE'; payload: Notice | null }
  | { type: 'SET_CURRENT_SONG_ID'; payload: string | null }
  | { type: 'SET_RESTORING'; payload: boolean }
  | { type: 'RESET' };

const audioReducer = (state: AppState, action: AudioAction): AppState => {
  switch (action.type) {
    case 'SET_FILE':
      return { ...state, currentFile: action.payload };
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
    case 'SET_NOTICE':
      return { ...state, notice: action.payload };
    case 'SET_CURRENT_SONG_ID':
      return { ...state, currentSongId: action.payload };
    case 'SET_RESTORING':
      return { ...state, isRestoring: action.payload };
    case 'RESET':
      // 表示中の曲だけを初期化する。曲一覧・裏で進んでいる分離ジョブ・お知らせはそのまま残す
      return {
        ...initialState,
        songs: state.songs,
        notice: state.notice,
        processingStatus: state.processingStatus,
        // 選んだファイルの表示は、分離中・失敗時のアップロード画面でだけ使う
        currentFile: state.processingStatus.status === 'idle' ? null : state.currentFile,
      };
    default:
      return state;
  }
};

const toVolumeMap = (tracks: AudioTrack[]) =>
  tracks.reduce<{ [trackId: string]: number }>((acc, track) => {
    acc[track.id] = track.volume;
    return acc;
  }, {});

const isJobRunning = (status: ProcessingStatus) => status.status === 'uploading' || status.status === 'processing';

// 分離が完了した曲。ブラウザに保存できなかった場合でも「開く」で表示できるよう、音声データごと持っておく
interface CompletedSong {
  song: SavedSong;
  trackBlobs: TrackBlobs;
  saved: boolean;
  saveError: string | null;
}

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // リロード直後に保存済みの曲を開く場合は、最初から「読み込み中」にしておく（アップロード画面のちらつき防止）
  const [state, dispatch] = useReducer(audioReducer, initialState, init => ({
    ...init,
    isRestoring: !!getCurrentSongId(),
  }));

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const mediaSourceNodesRef = useRef<Map<string, MediaElementAudioSourceNode>>(new Map());
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const animationFrameRef = useRef<number | undefined>(undefined);
  const tracksRef = useRef<AudioTrack[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const durationRef = useRef<number>(0);
  // 表示中の曲のID。分離ジョブの処理（非同期）から「今どの画面か」を判断するために ref でも持つ
  const songIdRef = useRef<string | null>(null);
  const isRestoringRef = useRef<boolean>(state.isRestoring);
  const restoreStartedRef = useRef<boolean>(false);
  const completedSongRef = useRef<CompletedSong | null>(null);
  // 進捗を確認中のジョブ。キャンセルされたら null にし、確認処理はそれを見て止まる
  const activeJobIdRef = useRef<string | null>(null);
  // アップロード中にキャンセルされたら、送信を中止するために使う
  const uploadAbortRef = useRef<AbortController | null>(null);

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

  const getAudioContext = () =>
    audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();

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

  const toErrorText = (error: unknown) =>
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';

  const setRestoring = (isRestoring: boolean) => {
    isRestoringRef.current = isRestoring;
    dispatch({ type: 'SET_RESTORING', payload: isRestoring });
  };

  // 表示中の曲のIDを、非同期処理用の ref・画面表示用の state にそろえて設定する。
  // ブラウザに保存済みの曲だけ、リロード後に開き直せるよう localStorage にも記録する
  const setDisplayedSongId = (songId: string | null, saved: boolean) => {
    songIdRef.current = songId;
    dispatch({ type: 'SET_CURRENT_SONG_ID', payload: songId });
    setCurrentSongId(saved ? songId : null);
  };

  // 曲一覧を IndexedDB から読み直す
  const refreshSongs = async () => {
    try {
      dispatch({ type: 'SET_SONGS', payload: await listSongs() });
    } catch (error) {
      console.warn('曲一覧を読み込めませんでした:', error);
    }
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

  // 各トラックの音声を取得して解析し、波形と曲の長さを作る。画面の表示には触れないので、別の曲を聴いている間でも裏で実行できる。
  // 音声の解析（decodeAudioData）は重く、解析結果（AudioBuffer）は1曲で数百MBになるため、波形と長さだけを取り出して捨てる
  const analyzeTracks = async (
    getTrackBlob: (trackId: string) => Promise<Blob>,
    onProgress?: (trackName: string, step: number) => void,
    shouldStop?: () => boolean,
  ): Promise<{ trackBlobs: TrackBlobs; waveforms: { [trackId: string]: number[] }; duration: number }> => {
    const audioContext = getAudioContext();
    const trackBlobs: TrackBlobs = {};
    const waveforms: { [trackId: string]: number[] } = {};
    let duration = 0;
    let step = 0;

    for (const track of initialTracks) {
      // キャンセルされたら、残りのトラックのダウンロードと解析をやめる
      if (shouldStop?.()) break;
      onProgress?.(`${track.name}ダウンロード中`, ++step);
      const blob = await getTrackBlob(track.id);
      trackBlobs[track.id] = blob;

      onProgress?.(`${track.name}の波形を作成中`, ++step);
      const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
      duration = Math.max(duration, audioBuffer.duration);
      waveforms[track.id] = generateWaveform(audioBuffer);
    }

    return { trackBlobs, waveforms, duration };
  };

  // 1トラック分の音声を再生できるようにつなぐ（<audio> → 音量調整 → スピーカー）。音声の解析はしないので一瞬で終わる
  const attachTrackAudio = (trackId: string, blob: Blob, volume: number) => {
    const audioContext = getAudioContext();

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
  };

  // 表示中の曲を画面から外す（ブラウザの保存データと、裏で進んでいる分離ジョブはそのまま）
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

    setDisplayedSongId(null, false);
    dispatch({ type: 'RESET' });
  };

  // 波形と音声データがそろった曲を画面に表示する。音声の解析は済んでいるので即座に表示できる（再生の準備は裏で進む）
  const showSong = (song: SavedSong, trackBlobs: TrackBlobs, saved: boolean) => {
    setDisplayedSongId(song.id, saved);
    dispatch({ type: 'SET_FILE_NAME', payload: song.fileName });
    if (song.audioInfo) {
      dispatch({ type: 'SET_AUDIO_INFO', payload: song.audioInfo });
    }

    initialTracks.forEach(track => {
      const blob = trackBlobs[track.id];
      if (!blob) throw new Error(`${track.name}のデータが保存されていません`);
      const volume = song.volumes[track.id] ?? track.volume;
      attachTrackAudio(track.id, blob, volume);
      dispatch({
        type: 'UPDATE_TRACK',
        payload: { trackId: track.id, updates: { volume, waveform: song.waveforms?.[track.id] ?? [] } },
      });
    });
    dispatch({ type: 'SET_DURATION', payload: song.duration ?? 0 });
  };

  // ブラウザに保存されている曲を読み込んで表示する
  const restoreSong = async (songId: string) => {
    setRestoring(true);
    try {
      const storedSong = await getSong(songId);
      const trackBlobs = storedSong && (await getSongTracks(songId));
      if (!storedSong || !trackBlobs) {
        setCurrentSongId(null);
        return;
      }

      let song = storedSong;
      // サイズを記録していなかった古いデータは、ここで記録して一覧に表示できるようにする
      if (song.storedSize === undefined) {
        song = { ...song, storedSize: getTotalBlobSize(trackBlobs) };
        updateSong(song.id, { storedSize: song.storedSize })
          .then(refreshSongs)
          .catch(error => console.warn('サイズを保存できませんでした:', error));
      }
      // 波形を保存していなかった古いデータは、1回だけ解析して波形を保存する（次回からは即時表示になる）
      if (!song.waveforms || !song.duration) {
        const { waveforms, duration } = await analyzeTracks(async trackId => {
          const blob = trackBlobs[trackId];
          if (!blob) throw new Error(`${trackId} のデータが保存されていません`);
          return blob;
        });
        song = { ...song, waveforms, duration };
        updateSong(song.id, { waveforms, duration }).catch(error => console.warn('波形を保存できませんでした:', error));
      }

      showSong(song, trackBlobs, true);
    } catch (error) {
      console.error('Failed to restore song:', error);
      // 壊れたデータを残すと毎回失敗するため削除する
      unloadCurrentSong();
      deleteSong(songId)
        .catch(() => {})
        .then(refreshSongs);
      dispatch({
        type: 'SET_NOTICE',
        payload: { kind: 'error', message: `保存された曲を読み込めなかったため、一覧から削除しました（${toErrorText(error)}）` },
      });
    } finally {
      setRestoring(false);
    }
  };

  // 分離が完了した曲を保存し、アップロード画面を見ていればそのまま開く。別の曲を聴いていれば、お知らせだけ出す
  const finishJob = async (job: PendingJob, audioInfo: AudioInfo | null, result: Awaited<ReturnType<typeof analyzeTracks>>) => {
    const song: SavedSong = {
      id: job.jobId,
      fileName: job.fileName,
      fileSize: job.fileSize,
      createdAt: Date.now(),
      audioInfo,
      volumes: toVolumeMap(initialTracks),
      waveforms: result.waveforms,
      duration: result.duration,
      storedSize: getTotalBlobSize(result.trackBlobs),
    };

    setPendingJob(null);
    let saveError: string | null = null;
    try {
      await saveSong(song, result.trackBlobs);
      await refreshSongs();
    } catch (error) {
      console.warn('曲をブラウザに保存できませんでした:', error);
      // 容量不足は QuotaExceededError になる。ブラウザによっては原因不明（UnknownError）として返ることもあるため同じ扱いにする
      const isStorageFull =
        error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'UnknownError');
      saveError = isStorageFull
        ? '容量が不足しているため、この曲は保存されませんでした。不要な曲を削除するか、端末の空き容量を増やしてください。'
        : 'この曲はブラウザに保存されませんでした。リロードしたり別の曲に切り替えたりすると、この曲は表示されなくなります。';
    }

    completedSongRef.current = { song, trackBlobs: result.trackBlobs, saved: saveError === null, saveError };
    dispatch({ type: 'SET_PROCESSING_STATUS', payload: idleStatus });

    if (songIdRef.current === null && !isRestoringRef.current) {
      openCompletedSong();
    } else {
      dispatch({
        type: 'SET_NOTICE',
        payload: {
          kind: 'success',
          message: `「${job.fileName}」の分離が完了しました`,
          canOpenCompletedSong: true,
        },
      });
    }
  };

  // 分離が完了した曲を開く（アップロード画面から自動で、または「開く」ボタンから）
  const openCompletedSong = () => {
    const completed = completedSongRef.current;
    if (!completed || isRestoringRef.current) return;
    completedSongRef.current = null;

    if (songIdRef.current !== null) {
      unloadCurrentSong();
    }
    dispatch({ type: 'SET_NOTICE', payload: null });
    try {
      showSong(completed.song, completed.trackBlobs, completed.saved);
      dispatch({ type: 'SET_SAVE_ERROR', payload: completed.saveError });
    } catch (error) {
      console.error('Failed to open completed song:', error);
      unloadCurrentSong();
      dispatch({ type: 'SET_NOTICE', payload: { kind: 'error', message: `曲を開けませんでした（${toErrorText(error)}）` } });
    }
  };

  const failJob = (message: string, error: unknown, fileName: string) => {
    dispatch({
      type: 'SET_PROCESSING_STATUS',
      payload: { status: 'error', progress: 0, message, fileName, error: toErrorText(error) },
    });
    // 別の曲を聴いている間に失敗した場合も気づけるよう、お知らせを出す
    if (songIdRef.current !== null) {
      dispatch({ type: 'SET_NOTICE', payload: { kind: 'error', message: `「${fileName}」の${message}` } });
    }
  };

  // バックエンドの処理状況を1秒ごとに確認する。アップロード直後と、分離途中でリロードしたときの両方から呼ばれる
  const pollJob = (job: PendingJob) => {
    activeJobIdRef.current = job.jobId;
    // キャンセルされた（または別のジョブに替わった）ら、以降の確認・ダウンロード・保存はしない
    const isActive = () => activeJobIdRef.current === job.jobId;

    const setJobProgress = (progress: number, message: string) => {
      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: { status: 'processing', progress, message, jobId: job.jobId, fileName: job.fileName },
      });
    };

    const checkStatus = async () => {
      if (!isActive()) return;
      try {
        const status = await getStatus(job.jobId);
        if (!isActive() || status.status === 'cancelled') return;

        if (status.status === 'completed') {
          setJobProgress(88, 'トラック読み込み開始');
          const result = await analyzeTracks(
            trackId => downloadTrack(job.jobId, trackId),
            (message, step) => isActive() && setJobProgress(Math.min(87 + step, 99), message),
            () => !isActive(),
          );
          if (!isActive()) return;
          activeJobIdRef.current = null;
          await finishJob(job, status.audio_info ?? null, result);
        } else if (status.status === 'processing') {
          const currentProgress = Math.min(status.progress, 87);
          setJobProgress(currentProgress, getProgressMessage(currentProgress));
          setTimeout(checkStatus, 1000);
        } else {
          activeJobIdRef.current = null;
          setPendingJob(null);
          failJob('分離に失敗しました', status.error || '分離処理中にエラーが発生しました', job.fileName);
        }
      } catch (error) {
        if (!isActive()) return;
        activeJobIdRef.current = null;
        if (isNotFoundError(error)) {
          // サーバーの再起動・スリープでジョブが消えた場合。再試行しても戻らないので保存情報も消す
          setPendingJob(null);
          failJob(
            '分離に失敗しました',
            'サーバーが再起動したため、処理中のデータが失われました。もう一度アップロードしてください。',
            job.fileName,
          );
        } else {
          // 通信エラーなどの一時的な失敗。ジョブ情報は残し、リロードで再確認できるようにする
          failJob('分離に失敗しました', error, job.fileName);
        }
      }
    };

    checkStatus();
  };

  const uploadAudioFile = async (file: File) => {
    // 分離は1曲ずつ。上限に達しているときも受け付けない
    if (isJobRunning(state.processingStatus) || state.songs.length >= MAX_SONGS) return;

    try {
      dispatch({ type: 'SET_FILE', payload: file });
      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: { status: 'uploading', progress: 0, message: 'アップロード中', fileName: file.name },
      });

      const abortController = new AbortController();
      uploadAbortRef.current = abortController;
      const uploadResponse = await uploadFile(file, abortController.signal);
      uploadAbortRef.current = null;
      if (abortController.signal.aborted) {
        // 送信し終わった直後にキャンセルされた場合は、サーバー側の分離も止める
        requestCancelJob(uploadResponse.job_id).catch(() => {});
        return;
      }
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
          fileName: job.fileName,
        },
      });

      pollJob(job);
    } catch (error) {
      uploadAbortRef.current = null;
      // キャンセルボタンで送信を中止した場合はエラーにしない
      if (isCanceledRequest(error)) return;
      failJob('アップロードに失敗しました', error, file.name);
    }
  };

  // 分離をキャンセルする。画面はすぐにアップロード前の状態に戻し、サーバーには分離の中止を伝える
  const cancelJob = () => {
    if (!isJobRunning(state.processingStatus)) return;

    const jobId = activeJobIdRef.current;
    activeJobIdRef.current = null;
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    setPendingJob(null);
    dispatch({ type: 'SET_PROCESSING_STATUS', payload: idleStatus });
    dispatch({ type: 'SET_FILE', payload: null });

    if (jobId) {
      requestCancelJob(jobId).catch(error => {
        // サーバーの再起動などでジョブが既に無い場合は、止める必要もないので無視する
        if (!isNotFoundError(error)) console.warn('サーバーの分離を止められませんでした:', error);
      });
    }
  };

  // 起動時（リロード時）に、保存済みの曲を開き直し、分離途中のジョブがあれば裏で確認を再開する
  useEffect(() => {
    // StrictMode では effect が2回実行されるため、2回目は何もしない
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;

    requestPersistentStorage();
    refreshSongs();

    const songId = getCurrentSongId();
    if (songId) {
      restoreSong(songId);
    }

    const pendingJob = getPendingJob();
    if (pendingJob) {
      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: {
          status: 'processing',
          progress: 0,
          message: '処理状況を確認中',
          jobId: pendingJob.jobId,
          fileName: pendingJob.fileName,
        },
      });
      pollJob(pendingJob);
    }
    // 起動時に1回だけ実行したいので依存配列は空にする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 音量を変えたら保存する（スライダー操作中に何度も書き込まないよう少し待つ）
  useEffect(() => {
    const songId = songIdRef.current;
    if (!songId || state.isRestoring) return;

    const volumes = toVolumeMap(state.tracks);
    const timer = setTimeout(() => {
      updateSong(songId, { volumes }).catch(error => console.warn('音量を保存できませんでした:', error));
    }, 500);

    return () => clearTimeout(timer);
  }, [state.tracks, state.isRestoring]);

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
    const songId = songIdRef.current;
    if (!songId) return;

    try {
      const volumes: { [key: string]: number } = {};
      state.tracks.forEach(track => {
        volumes[track.id] = track.volume / 100;
      });

      const { blob, filename } = await mixTracks(songId, volumes);
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

  // 「新しい曲」：表示中の曲を外してアップロード画面に戻る（曲は一覧に残る。分離中ならその進捗が表示される）
  const resetApp = () => {
    if (isRestoringRef.current) return;
    unloadCurrentSong();
  };

  // 曲一覧から曲を選んで表示する（分離中でも切り替えられる）
  const selectSong = (songId: string) => {
    if (isRestoringRef.current || songId === songIdRef.current) return;
    // 完了のお知らせが出ている曲を一覧から開いた場合は、お知らせも片付ける
    if (completedSongRef.current?.song.id === songId) {
      dismissNotice();
    }
    unloadCurrentSong();
    restoreSong(songId);
  };

  // 曲一覧から曲を削除する。表示中の曲なら画面からも外す
  const removeSong = async (songId: string) => {
    if (isRestoringRef.current) return;
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

  // お知らせを閉じたら、開かなかった完了済みの曲の音声データ（数百MB）もメモリから手放す。保存済みなら一覧から開ける
  const dismissNotice = () => {
    completedSongRef.current = null;
    dispatch({ type: 'SET_NOTICE', payload: null });
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
        cancelJob,
        togglePlayback,
        updateTrackVolume,
        seekTo,
        exportTracks,
        resetApp,
        dismissSaveError,
        dismissNotice,
        openCompletedSong,
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
