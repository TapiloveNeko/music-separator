import React from 'react';
import { AudioProvider, useAudio } from './contexts/AudioContext';
import FileUpload from './components/FileUpload';
import ProcessingStatus from './components/ProcessingStatus';
import TrackControls from './components/TrackControls';
import AudioPlayer from './components/AudioPlayer';

const AppContent: React.FC = () => {
  const { state, seekTo } = useAudio();
  const { processingStatus, tracks, currentFile, currentTime, duration } = state;
  const [dragProgress, setDragProgress] = React.useState(0);
  const [lastSeekTime, setLastSeekTime] = React.useState<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const tracksRef = React.useRef<HTMLDivElement>(null);

  const showUpload = processingStatus.status === 'idle' || processingStatus.status === 'error';
  const showSeparation = processingStatus.status === 'completed';

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

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!tracksRef.current) return;
    
    const rect = tracksRef.current.getBoundingClientRect();
    const leftSectionWidth = getLeftSectionWidth();
    const x = event.clientX - rect.left - leftSectionWidth;
    const waveformWidth = rect.width - leftSectionWidth;
    const progress = Math.max(0, Math.min(1, x / waveformWidth));
    
    setDragProgress(progress);
    setLastSeekTime(null);
    setIsDragging(true);
  };

  const handleMouseMove = React.useCallback((event: MouseEvent) => {
    if (!isDragging || !tracksRef.current) return;
    
    const rect = tracksRef.current.getBoundingClientRect();
    const leftSectionWidth = window.innerWidth < 768 ? 120 : 200;
    const x = event.clientX - rect.left - leftSectionWidth;
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
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
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
      {!showUpload && (
        <header className="text-center pt-16 md:pt-32 px-8 md:px-12 backdrop-blur-[10px]">
          <h1 className="text-[2.8rem] md:text-[4rem] font-bold bg-white bg-clip-text text-transparent">
            曲から楽器を切り離す
          </h1>
          <p className="text-[1.4rem] md:text-[1.8rem] font-light mt-2 md:mt-4 opacity-80">
            AI搭載のアルゴリズムで音楽を分割して表示
          </p>
        </header>
      )}

      <main className={`flex-1 p-8 md:p-12 ${showUpload ? 'flex flex-col justify-center items-center' : ''}`}>
        {showUpload && (
          <div className="flex flex-col items-center text-center">
            <h1 className="text-[2.8rem] md:text-[4rem] font-bold bg-white bg-clip-text text-transparent">
              曲から楽器を切り離す
            </h1>
            <p className="text-[1.4rem] md:text-[1.8rem] font-light mt-2 md:mt-4 opacity-80">
              AI搭載のアルゴリズムで音楽を分割して表示
            </p>
            <FileUpload />
          </div>
        )}
        <ProcessingStatus />
        
        {showSeparation && (
          <div className="w-full max-w-[1200px] mx-auto rounded-[20px] backdrop-blur-[10px]">
            <div className="text-center md:text-right">
              <span className="text-[1.4rem] md:text-[1.8rem] font-medium text-white break-all">{currentFile?.name}</span>
            </div>

            <div ref={tracksRef} className="mt-6 md:mt-12 relative">
              {tracks.map(track => (
                <TrackControls 
                  key={track.id} 
                  track={track}
                  onWaveformMouseDown={handleMouseDown}
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