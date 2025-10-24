import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { AppState, ProcessingStatus, AudioTrack, AudioInfo } from '../types';
import { uploadFile, getStatus, downloadTrack } from '../services/api';

interface AudioContextType {
  state: AppState;
  uploadAudioFile: (file: File) => Promise<void>;
  togglePlayback: () => void;
  updateTrackVolume: (trackId: string, volume: number) => void;
  seekTo: (time: number) => void;
  exportTracks: () => Promise<void>;
  resetApp: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);
// htdemucs_ftを使用する場合はguitarとpianoをコメントアウトする
const initialTracks: AudioTrack[] = [
  { id: 'vocals', name: 'ボーカル', color: '#f1c40f', volume: 100, waveform: [] },
  { id: 'guitar', name: 'ギター', color: '#e74c3c', volume: 100, waveform: [] },
  { id: 'bass', name: 'ベース', color: '#3498db', volume: 100, waveform: [] },
  { id: 'drums', name: 'ドラム', color: '#2ecc71', volume: 100, waveform: [] },
  { id: 'piano', name: 'ピアノ', color: '#ec4899', volume: 100, waveform: [] },
  { id: 'other', name: 'その他', color: '#9b59b6', volume: 100, waveform: [] },
];

const initialState: AppState = {
  currentFile: null,
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
};

type AudioAction =
  | { type: 'SET_FILE'; payload: File }
  | { type: 'SET_PROCESSING_STATUS'; payload: ProcessingStatus }
  | { type: 'SET_AUDIO_INFO'; payload: AudioInfo }
  | { type: 'UPDATE_TRACK'; payload: { trackId: string; updates: Partial<AudioTrack> } }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_CURRENT_TIME'; payload: number }
  | { type: 'SET_DURATION'; payload: number }
  | { type: 'RESET' };

const audioReducer = (state: AppState, action: AudioAction): AppState => {
  switch (action.type) {
    case 'SET_FILE':
      return { ...state, currentFile: action.payload };
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
    case 'RESET':
      return initialState;
    default:
      return state;
  }
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(audioReducer, initialState);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const tracksRef = useRef<AudioTrack[]>([]);
  const isPlayingRef = useRef<boolean>(false);

  useEffect(() => {
    tracksRef.current = state.tracks;
  }, [state.tracks]);

  useEffect(() => {
    isPlayingRef.current = state.isPlaying;
  }, [state.isPlaying]);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const stopAllTracks = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    const currentPos = audioContext.currentTime - startTimeRef.current;
    pauseTimeRef.current = Math.max(0, currentPos);

    sourceNodesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {}
    });

    sourceNodesRef.current.clear();
  }, []);

  const playAllTracks = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    sourceNodesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {}
    });
    sourceNodesRef.current.clear();

    const offset = pauseTimeRef.current;

    tracksRef.current.forEach(track => {
      if (!track.audioBuffer) return;

      const source = audioContext.createBufferSource();
      const gainNode = audioContext.createGain();
      
      source.buffer = track.audioBuffer;
      gainNode.gain.value = track.volume / 100;
      
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      source.start(0, offset);
      
      sourceNodesRef.current.set(track.id, source);
      gainNodesRef.current.set(track.id, gainNode);

      source.onended = () => {
        if (isPlayingRef.current) {
          dispatch({ type: 'SET_PLAYING', payload: false });
          pauseTimeRef.current = 0;
          dispatch({ type: 'SET_CURRENT_TIME', payload: 0 });
        }
      };
    });

    startTimeRef.current = audioContext.currentTime - offset;
  }, []);

  const startTimeUpdate = useCallback(() => {
    const updateTime = () => {
      const audioContext = audioContextRef.current;
      if (!audioContext) return;

      const currentTime = audioContext.currentTime - startTimeRef.current;
      dispatch({ type: 'SET_CURRENT_TIME', payload: currentTime });

      animationFrameRef.current = requestAnimationFrame(updateTime);
    };

    animationFrameRef.current = requestAnimationFrame(updateTime);
  }, []);

  const stopTimeUpdate = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

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
    const wasPlaying = isPlayingRef.current;
    const clampedTime = Math.max(0, Math.min(time, state.duration));
    
    sourceNodesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {}
    });
    sourceNodesRef.current.clear();
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    pauseTimeRef.current = clampedTime;
    dispatch({ type: 'SET_CURRENT_TIME', payload: clampedTime });
    
    if (!wasPlaying) return;
    
    const audioContext = audioContextRef.current;
    if (!audioContext) return;
  
    tracksRef.current.forEach(track => {
      if (!track.audioBuffer) return;
  
      const source = audioContext.createBufferSource();
      const gainNode = gainNodesRef.current.get(track.id) || audioContext.createGain();
      
      source.buffer = track.audioBuffer;
      gainNode.gain.value = track.volume / 100;
      
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      source.start(0, clampedTime);
      
      sourceNodesRef.current.set(track.id, source);
      gainNodesRef.current.set(track.id, gainNode);
    });
  
    startTimeRef.current = audioContext.currentTime - clampedTime;
    
    const updateTime = () => {
      if (!isPlayingRef.current || !audioContextRef.current) return;
      const currentTime = audioContextRef.current.currentTime - startTimeRef.current;
      dispatch({ type: 'SET_CURRENT_TIME', payload: currentTime });
      animationFrameRef.current = requestAnimationFrame(updateTime);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateTime);
  }, [state.duration]);

  const uploadAudioFile = async (file: File) => {
    try {
      dispatch({ type: 'SET_FILE', payload: file });
      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: { status: 'uploading', progress: 0, message: 'アップロード中...' },
      });

      const uploadResponse = await uploadFile(file);
      
      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: {
          status: 'processing',
          progress: 0,
          message: '音声処理中...',
          jobId: uploadResponse.job_id,
        },
      });

      const checkStatus = async () => {
        try {
          const status = await getStatus(uploadResponse.job_id);
          
          if (status.status === 'completed') {
            dispatch({
              type: 'SET_PROCESSING_STATUS',
              payload: {
                status: 'processing',
                progress: Math.min(status.progress, 95),
                message: 'トラックを読み込み中...',
                jobId: uploadResponse.job_id,
              },
            });
            
            if (status.audio_info) {
              dispatch({ type: 'SET_AUDIO_INFO', payload: status.audio_info });
            }
            
            await loadSeparatedTracks(uploadResponse.job_id);
            
            dispatch({
              type: 'SET_PROCESSING_STATUS',
              payload: {
                status: 'completed',
                progress: 100,
                message: '処理完了！',
                jobId: uploadResponse.job_id,
              },
            });
          } else if (status.status === 'processing') {
            dispatch({
              type: 'SET_PROCESSING_STATUS',
              payload: {
                status: status.status,
                progress: Math.min(status.progress, 90),
                message: '音声処理中...',
                jobId: uploadResponse.job_id,
              },
            });
            setTimeout(checkStatus, 1000);
          }
        } catch (error) {
          dispatch({
            type: 'SET_PROCESSING_STATUS',
            payload: {
              status: 'error',
              progress: 0,
              message: '処理に失敗しました',
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        }
      };

      checkStatus();
    } catch (error) {
      dispatch({
        type: 'SET_PROCESSING_STATUS',
        payload: {
          status: 'error',
          progress: 0,
          message: 'アップロードに失敗しました',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  };

  const loadSeparatedTracks = async (jobId: string) => {
    try {
      let maxDuration = 0;

      for (const track of state.tracks) {
        const audioBlob = await downloadTrack(jobId, track.id);
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        maxDuration = Math.max(maxDuration, audioBuffer.duration);
        
        dispatch({
          type: 'UPDATE_TRACK',
          payload: {
            trackId: track.id,
            updates: { audioBuffer, waveform: generateWaveform(audioBuffer) },
          },
        });
      }

      dispatch({ type: 'SET_DURATION', payload: maxDuration });
    } catch (error) {
      console.error('Failed to load separated tracks:', error);
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

  const togglePlayback = () => {
    const hasLoadedTracks = state.tracks.some(track => track.audioBuffer);
    
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
      for (const track of state.tracks) {
        const audioBlob = await downloadTrack(state.processingStatus.jobId, track.id);
        const url = URL.createObjectURL(audioBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${track.name}_track.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const resetApp = () => {
    if (state.isPlaying) {
      stopAllTracks();
    }
    
    pauseTimeRef.current = 0;
    startTimeRef.current = 0;
    
    dispatch({ type: 'RESET' });
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