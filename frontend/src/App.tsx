import React from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { AudioProvider, useAudio } from './contexts/AudioContext';
import FileUpload from './components/FileUpload';
import ProcessingStatus from './components/ProcessingStatus';
import TrackControls from './components/TrackControls';
import AudioPlayer from './components/AudioPlayer';

const GlobalStyle = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    overscroll-behavior: none;
    font-size: 62.5%;
  }

  body {
    font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background: #16213e;
    color: #ffffff;
    min-height: 100vh;
    overflow-x: hidden;
  }

  code {
    font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace;
  }
`;

const AppContainer = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  text-align: center;
  padding: 3.2rem 1.6rem;
  backdrop-filter: blur(10px);
`;

const MainTitle = styled.h1`
  font-size: 4rem;
  font-weight: 700;
  margin-bottom: 0.8rem;
  background: #ffffff;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const Subtitle = styled.p`
  font-size: 1.8rem;
  font-weight: 300;
  opacity: 0.8;
`;

const MainContent = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3.2rem;
`;

const SeparationSection = styled.div`
  width: 100%;
  max-width: 1200px;
  border-radius: 20px;
  padding: 3.2rem;
  backdrop-filter: blur(10px);
`;

const FileInfo = styled.div`
  text-align: right;
  margin-bottom: 3.2rem;
`;

const FileName = styled.span`
  font-size: 1.8rem;
  font-weight: 500;
  color: #ffffff;
`;

const TracksContainer = styled.div`
  margin-bottom: 3.2rem;
  position: relative;
`;

const GlobalPlayhead = styled.div<{ $leftPx: number }>`
  position: absolute;
  top: 0;
  left: ${props => props.$leftPx}px;
  width: 2px;
  height: 100%;
  background-color: #ffffff;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.6);
  z-index: 20;
  pointer-events: none;
`;

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

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!tracksRef.current) return;
    
    const rect = tracksRef.current.getBoundingClientRect();
    const leftSectionWidth = 200;
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
    const leftSectionWidth = 200;
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
  
  const playheadLeftPx = containerWidth > 0
    ? 200 + playheadProgress * (containerWidth - 200)
    : 200;

  return (
    <AppContainer>
      <Header>
        <MainTitle>曲から楽器を切り離す</MainTitle>
        <Subtitle>AI搭載のアルゴリズムで音楽を分割して表示</Subtitle>
      </Header>

      <MainContent>
        {showUpload && <FileUpload />}
        <ProcessingStatus />
        
        {showSeparation && (
          <SeparationSection>
            <FileInfo>
              <FileName>{currentFile?.name}</FileName>
            </FileInfo>

            <TracksContainer ref={tracksRef}>
              {tracks.map(track => (
                <TrackControls 
                  key={track.id} 
                  track={track}
                  onWaveformMouseDown={handleMouseDown}
                />
              ))}
              <GlobalPlayhead $leftPx={playheadLeftPx} />
            </TracksContainer>

            <AudioPlayer />
          </SeparationSection>
        )}
      </MainContent>
    </AppContainer>
  );
};

const App: React.FC = () => {
  return (
    <>
      <GlobalStyle />
      <AudioProvider>
        <AppContent />
      </AudioProvider>
    </>
  );
};

export default App;