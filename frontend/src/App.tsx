import React from 'react';
import { AudioProvider, useAudio } from './contexts/AudioContext';
import FileUpload from './components/FileUpload';
import ProcessingStatus from './components/ProcessingStatus';
import TrackControls from './components/TrackControls';
import AudioPlayer from './components/AudioPlayer';
import SongList from './components/SongList';
import { MAX_SONGS } from './services/storage';

const AppContent: React.FC = () => {
  const { state, seekTo, dismissSaveError, dismissNotice, openCompletedSong } = useAudio();
  const { processingStatus, tracks, currentFileName, currentTime, duration } = state;
  const [dragProgress, setDragProgress] = React.useState(0);
  const [lastSeekTime, setLastSeekTime] = React.useState<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [isSongListOpen, setIsSongListOpen] = React.useState(false);

  // 曲一覧を開いているときは Esc キーで閉じられるようにする
  React.useEffect(() => {
    if (!isSongListOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSongListOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSongListOpen]);

  // 曲一覧を開いている間は、後ろのページがスクロールしないように固定する。
  // iPhone の Safari は body の overflow: hidden だけでは止まらないため、body を position: fixed にして現在の位置で固定する
  React.useEffect(() => {
    if (!isSongListOpen) return;

    const { style } = document.body;
    const scrollY = window.scrollY;
    // スクロールバーが消えた分だけ画面が横にずれないよう、その幅を余白で補う
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const previous = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      overflow: style.overflow,
      paddingRight: style.paddingRight,
    };

    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.left = '0';
    style.right = '0';
    style.overflow = 'hidden';
    style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      Object.assign(style, previous);
      window.scrollTo(0, scrollY);
    };
  }, [isSongListOpen]);
  const tracksRef = React.useRef<HTMLDivElement>(null);

  // 表示中の曲があれば曲の画面、無ければ「新しい曲」の画面（分離中なら進捗、それ以外はアップロード）を出す。
  // 分離は表示中の曲とは関係なく裏で進むので、分離中でも保存済みの曲を開いて聴ける
  const isJobRunning = processingStatus.status === 'uploading' || processingStatus.status === 'processing';
  const isNewSongView = !state.currentSongId && !state.isRestoring;
  const showUpload = isNewSongView && !isJobRunning;
  const showProgress = isNewSongView && isJobRunning;
  const showSeparation = !!state.currentSongId && !state.isRestoring;
  const isSongLimitReached = state.songs.length >= MAX_SONGS;

  React.useEffect(() => {
    const updateWidth = () => {
      if (tracksRef.current) {
        setContainerWidth(tracksRef.current.getBoundingClientRect().width);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  React.useEffect(() => {
    if (showSeparation && tracksRef.current) {
      setContainerWidth(tracksRef.current.getBoundingClientRect().width);
    }
  }, [showSeparation, tracks]);

  const getLeftSectionWidth = () => {
    return window.innerWidth < 768 ? 120 : 200;
  };

  const getClientX = (event: MouseEvent | TouchEvent): number => {
    if ('touches' in event && event.touches[0]) return event.touches[0].clientX;
    if ('changedTouches' in event && (event as TouchEvent).changedTouches[0]) return (event as TouchEvent).changedTouches[0].clientX;
    return (event as MouseEvent).clientX;
  };

  const handleStart = (clientX: number) => {
    if (!tracksRef.current) return;
    const rect = tracksRef.current.getBoundingClientRect();
    const leftSectionWidth = getLeftSectionWidth();
    const x = clientX - rect.left - leftSectionWidth;
    const waveformWidth = rect.width - leftSectionWidth;
    const progress = Math.max(0, Math.min(1, x / waveformWidth));
    setDragProgress(progress);
    setLastSeekTime(null);
    setIsDragging(true);
  };

  const handleMouseMove = React.useCallback((event: MouseEvent | TouchEvent) => {
    if (!isDragging || !tracksRef.current) return;
    const rect = tracksRef.current.getBoundingClientRect();
    const leftSectionWidth = window.innerWidth < 768 ? 120 : 200;
    const x = getClientX(event) - rect.left - leftSectionWidth;
    const waveformWidth = rect.width - leftSectionWidth;
    const progress = Math.max(0, Math.min(1, x / waveformWidth));
    setDragProgress(progress);
  }, [isDragging]);

  const handleMouseUp = React.useCallback(() => {
    if (!isDragging) return;
    
    const newTime = dragProgress * duration;
    setLastSeekTime(newTime);
    seekTo(newTime);
    setIsDragging(false);
  }, [isDragging, dragProgress, duration, seekTo]);

  React.useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleMouseMove, { passive: false });
    document.addEventListener('touchend', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  React.useEffect(() => {
    if (lastSeekTime !== null && Math.abs(currentTime - lastSeekTime) < 0.5) {
      setLastSeekTime(null);
    }
  }, [currentTime, lastSeekTime]);

  const playheadProgress = duration > 0 
    ? (lastSeekTime !== null ? lastSeekTime / duration : currentTime / duration)
    : 0;
  
  const leftSectionWidth = getLeftSectionWidth();
  const playheadLeftPx = containerWidth > 0
    ? leftSectionWidth + playheadProgress * (containerWidth - leftSectionWidth)
    : leftSectionWidth;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-1/2 left-1/2 w-64 h-64 md:w-80 md:h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-rotate-pink"
        />
        <div 
          className="absolute top-1/2 left-1/2 w-64 h-64 md:w-80 md:h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-rotate-blue"
        />
      </div>

      <SongList isOpen={isSongListOpen} onClose={() => setIsSongListOpen(false)} />

      {/* 分離完了などのお知らせ。別の曲を聴いている間に分離が終わったときは「開く」で切り替えられる */}
      {state.notice && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-20 w-[calc(100%-14rem)] max-w-[560px] flex items-center gap-4 rounded-[12px] px-5 py-4 text-[1.4rem] text-white shadow-[0_8px_24px_rgba(0,0,0,0.4)] bg-[#0f1528] border"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 1.6rem)',
            borderColor: state.notice.kind === 'success' ? 'rgba(46,204,113,0.6)' : 'rgba(231,76,60,0.6)',
          }}
          role="status"
        >
          <span className="flex-1 break-all">{state.notice.message}</span>
          {state.notice.canOpenCompletedSong && (
            <button
              onClick={openCompletedSong}
              className="shrink-0 rounded-[8px] bg-success px-4 py-2 text-[1.3rem] font-medium text-white border-none cursor-pointer md:hover:opacity-90"
            >
              開く
            </button>
          )}
          <button
            onClick={dismissNotice}
            className="shrink-0 text-[1.8rem] leading-none text-white/60 bg-transparent border-none cursor-pointer"
            aria-label="お知らせを閉じる"
          >
            ×
          </button>
        </div>
      )}

      {/* 曲一覧を開くメニューボタン（ハンバーガー） */}
      <button
        onClick={() => setIsSongListOpen(true)}
        className="fixed left-4 md:left-6 z-20 w-[44px] h-[44px] flex flex-col justify-center items-center gap-[5px] rounded-[10px] bg-black/40 backdrop-blur-[10px] border border-white/20 cursor-pointer md:hover:bg-black/60"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1.6rem)' }}
        aria-label="曲一覧を開く"
      >
        <span className="block w-[20px] h-[2px] rounded-full bg-white" />
        <span className="block w-[20px] h-[2px] rounded-full bg-white" />
        <span className="block w-[20px] h-[2px] rounded-full bg-white" />
      </button>

      <div className="flex-1 flex flex-col">
        {!showUpload && (
          <header className="relative z-10 text-center pt-16 md:pt-32 px-8 md:px-12 backdrop-blur-[10px]">
            <h1 className="text-[3.2rem] md:text-[4rem] font-bold bg-white bg-clip-text text-transparent">
              曲から楽器を切り離す
            </h1>
            <p className="text-[1.5rem] md:text-[1.6rem] font-light mt-2 md:mt-4 opacity-50">
              AI搭載のアルゴリズムで音楽を分割して表示
            </p>
          </header>
        )}

        <main className={`relative z-10 flex-1 p-8 md:p-12 ${showUpload ? 'flex flex-col justify-center items-center' : ''}`}>
          {showUpload && (
            <div className="flex flex-col items-center text-center">
              <h1 className="text-[3.2rem] md:text-[4rem] font-bold bg-white bg-clip-text text-transparent">
                曲から楽器を切り離す
              </h1>
              <p className="text-[1.5rem] md:text-[1.6rem] font-light mt-2 md:mt-4 opacity-50">
                AI搭載のアルゴリズムで音楽を分割して表示
              </p>
              {isSongLimitReached ? (
                <div className="mt-8 md:mt-12 max-w-[550px] p-6 md:p-8 rounded-[15px] bg-white/10 text-[1.4rem] md:text-[1.6rem] text-white leading-relaxed">
                  保存できる曲は {MAX_SONGS} 曲までです。
                  <br />
                  新しい曲を分離するには、曲一覧から不要な曲を削除してください。
                </div>
              ) : (
                <FileUpload />
              )}
            </div>
          )}
          {showProgress && <ProcessingStatus />}
        
          {showSeparation && (
            <div className="w-full max-w-[1200px] mx-auto rounded-[20px] backdrop-blur-[10px]">
                {state.saveError && (
                  <div className="mb-6 md:mb-8 flex items-start gap-4 p-4 md:p-6 rounded-[10px] bg-danger/20 border border-danger/60 text-[1.4rem] md:text-[1.5rem] text-white leading-relaxed">
                    <span className="flex-1">{state.saveError}</span>
                    <button
                      onClick={dismissSaveError}
                      className="shrink-0 text-[1.8rem] leading-none text-white/70 bg-transparent border-none cursor-pointer"
                      aria-label="メッセージを閉じる"
                    >
                      ×
                    </button>
                  </div>
                )}
              <div className="text-right md:text-right">
                <span className="text-[1.5rem] md:text-[1.6rem] font-medium text-white break-all">{currentFileName}</span>
              </div>

              <div ref={tracksRef} className="mt-6 md:mt-12 relative">
                {tracks.map(track => (
                  <TrackControls 
                    key={track.id} 
                    track={track}
                    onWaveformMouseDown={(e) => handleStart(e.clientX)}
                    onWaveformTouchStart={(e) => handleStart(e.touches[0].clientX)}
                  />
                ))}
                <div 
                  className="absolute top-0 w-[2px] h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)] z-20 pointer-events-none"
                  style={{ left: `${playheadLeftPx}px` }}
                />
              </div>

              <AudioPlayer />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AudioProvider>
      <AppContent />
    </AudioProvider>
  );
};

export default App;