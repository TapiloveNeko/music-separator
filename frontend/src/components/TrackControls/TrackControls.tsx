import React from 'react';
import { AudioTrack } from '../../types';
import WaveformDisplay from '../WaveformDisplay';
import { useAudio } from '../../contexts/AudioContext';

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
    <div className="border-b border-white/5 relative flex items-center h-[70px] md:h-[80px]">
      <div className="track-left-section w-[120px] md:w-[200px] h-full p-2 md:p-4 bg-black/30 border-r border-white/5 flex flex-col justify-center">
        <span className="text-[1.5rem] md:text-[1.6rem] font-medium truncate block">{track.name}</span>
        <div className="flex items-center gap-2 md:gap-3 mt-2 md:mt-3">
          <input
            type="range"
            min="0"
            max="100"
            value={track.volume}
            onChange={handleVolumeChange}
            className="flex-1 min-w-0 h-[4px] rounded-[2px] bg-white/20 outline-none appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[12px] md:[&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:h-[12px] md:[&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_2px_4px_rgba(0,0,0,0.3)]
              [&::-moz-range-thumb]:w-[12px] md:[&::-moz-range-thumb]:w-[14px] [&::-moz-range-thumb]:h-[12px] md:[&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
          />
          <input
            type="number"
            min="0"
            max="100"
            value={track.volume}
            onChange={handleVolumeInputChange}
            onBlur={handleVolumeInputBlur}
            className="w-[38px] md:w-[45px] h-[24px] md:h-[28px] bg-white/10 border border-white/20 rounded text-white text-center text-[1.5rem] md:text-[1.6rem] outline-none focus:border-white/40 focus:bg-white/15 flex-shrink-0
              [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0
              [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0
              [-moz-appearance:textfield]"
          />
        </div>
      </div>
      <div 
        className="flex-1 relative h-full cursor-pointer overflow-hidden"
        style={{ backgroundColor: `${track.color}54` }}
        onMouseDown={onWaveformMouseDown}
      >
        <WaveformDisplay track={track} />
      </div>
    </div>
  );
};

export default TrackControls;