import React from 'react';
import styled from 'styled-components';
import { AudioTrack } from '../../types';
import WaveformDisplay from '../WaveformDisplay';
import { useAudio } from '../../contexts/AudioContext';

const TrackContainer = styled.div`
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  height: 80px;
`;

const TrackLeftSection = styled.div`
  width: 200px;
  height: 100%;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.3);
  border-right: 1px solid rgba(255, 255, 255, 0.05);
`;

const TrackName = styled.span`
  font-size: 1.6rem;
  font-weight: 500;
`;

const VolumeControl = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin: 0.8rem 0 0;
`;

const VolumeSlider = styled.input`
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.2);
  outline: none;
  -webkit-appearance: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ffffff;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ffffff;
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }
`;

const VolumeInput = styled.input`
  width: 45px;
  height: 28px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #ffffff;
  text-align: center;
  font-size: 1.4rem;
  outline: none;

  &:focus {
    border-color: rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.15);
  }

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  -moz-appearance: textfield;
`;

const WaveformSection = styled.div<{ $trackColor: string }>`
  flex: 1;
  position: relative;
  height: 100%;
  background: ${props => props.$trackColor}54;
  cursor: pointer;
`;

interface TrackControlsProps {
  track: AudioTrack;
  onWaveformMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
}

const TrackControls: React.FC<TrackControlsProps> = ({ track, onWaveformMouseDown }) => {
  const { updateTrackVolume } = useAudio();

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseInt(event.target.value);
    updateTrackVolume(track.id, volume);
  };

  const handleVolumeInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    
    if (value === '') {
      return;
    }

    const volume = parseInt(value);
    
    if (!isNaN(volume) && volume >= 0 && volume <= 100) {
      updateTrackVolume(track.id, volume);
    }
  };

  const handleVolumeInputBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const value = event.target.value;
    
    if (value === '' || isNaN(parseInt(value))) {
      event.target.value = track.volume.toString();
      return;
    }

    const volume = parseInt(value);
    
    if (volume < 0) {
      updateTrackVolume(track.id, 0);
    } else if (volume > 100) {
      updateTrackVolume(track.id, 100);
    }
  };

  return (
    <TrackContainer>
      <TrackLeftSection className="track-left-section">
        <TrackName>{track.name}</TrackName>
        <VolumeControl>
          <VolumeSlider
            type="range"
            min="0"
            max="100"
            value={track.volume}
            onChange={handleVolumeChange}
          />
          <VolumeInput
            type="number"
            min="0"
            max="100"
            value={track.volume}
            onChange={handleVolumeInputChange}
            onBlur={handleVolumeInputBlur}
          />
        </VolumeControl>
      </TrackLeftSection>
      <WaveformSection $trackColor={track.color} onMouseDown={onWaveformMouseDown}>
        <WaveformDisplay track={track} />
      </WaveformSection>
    </TrackContainer>
  );
};

export default TrackControls;