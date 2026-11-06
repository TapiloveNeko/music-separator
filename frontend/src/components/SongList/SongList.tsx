import React from 'react';
import { useAudio } from '../../contexts/AudioContext';
import { MAX_SONGS } from '../../services/storage';

interface SongListProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB` : `${Math.round(bytes / 1024 / 1024)} MB`;

// 左側の曲一覧。左上のメニューボタンで開閉する（PC・スマホ共通）
const SongList: React.FC<SongListProps> = ({ isOpen, onClose }) => {
  const { state, selectSong, removeSong, resetApp, cancelJob } = useAudio();
  const { songs, currentSongId, processingStatus, isRestoring } = state;

  // 分離中の曲は、一覧の先頭に「分離中」として表示する。分離は裏で進むので、その間も他の曲を選べる
  const isJobRunning = processingStatus.status === 'uploading' || processingStatus.status === 'processing';
  const isNewSongScreen = currentSongId === null && !isRestoring;

  const handleSelect = (songId: string) => {
    selectSong(songId);
    onClose();
  };

  const handleNewSong = () => {
    resetApp();
    onClose();
  };

  const handleCancelJob = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (window.confirm(`「${processingStatus.fileName ?? 'この曲'}」の分離をキャンセルしますか？\n（途中までの処理は破棄されます）`)) {
      cancelJob();
    }
  };

  const handleRemove = (event: React.MouseEvent, songId: string, fileName: string) => {
    event.stopPropagation();
    if (window.confirm(`「${fileName}」を一覧から削除しますか？\n（ブラウザに保存した分離データも削除されます）`)) {
      removeSong(songId);
    }
  };

  return (
    <>
      {/* 一覧を開いているときの背景。クリック（タップ）で閉じる */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside
        className={`fixed top-0 left-0 z-40 h-full w-[260px] flex flex-col bg-[#0f1528] border-r border-white/10 transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-start justify-between px-6 pt-8 pb-4">
          <div>
            <h2 className="text-[1.6rem] font-bold text-white">曲一覧</h2>
            <p className={`mt-1 text-[1.2rem] ${songs.length >= MAX_SONGS ? 'text-danger' : 'text-white/50'}`}>
              保存済み {songs.length}曲 ／ 最大{MAX_SONGS}曲
              {songs.length >= MAX_SONGS && '（上限）'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[2rem] leading-none text-white/70 bg-transparent border-none cursor-pointer"
            aria-label="曲一覧を閉じる"
          >
            ×
          </button>
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={handleNewSong}
            disabled={isJobRunning}
            className={`w-full rounded-[10px] py-3 text-[1.4rem] font-medium text-white border border-white/20 cursor-pointer transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${isNewSongScreen && !isJobRunning ? 'bg-secondary' : 'bg-white/5 md:hover:bg-white/10'}`}
          >
            ＋ 新しい曲
          </button>
          {isJobRunning && (
            <p className="mt-2 px-1 text-[1.2rem] text-white/60 leading-relaxed">
              分離が完了するまで新しい曲は選択できません。進捗は下の「分離中」から確認できます。
            </p>
          )}
        </div>

        <ul className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 space-y-2">
          {isJobRunning && (
            <li>
              {/* 押すと分離の進捗画面に移る */}
              <div
                role="button"
                tabIndex={0}
                onClick={handleNewSong}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') handleNewSong();
                }}
                className={`rounded-[10px] px-4 py-3 cursor-pointer transition-colors duration-200 border border-dashed border-white/30 ${isNewSongScreen ? 'bg-secondary' : 'bg-white/5 md:hover:bg-white/10'}`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[1.4rem] text-white break-all">{processingStatus.fileName}</div>
                    <div className="text-[1.2rem] text-white/70 mt-1">
                      {processingStatus.status === 'uploading' ? 'アップロード中' : `分離中 ${processingStatus.progress}%`}
                    </div>
                  </div>
                  <button
                    onClick={handleCancelJob}
                    className="shrink-0 rounded-[6px] border border-white/30 bg-transparent px-2 py-1 text-[1.1rem] text-white/80 cursor-pointer md:hover:bg-white/10"
                  >
                    キャンセル
                  </button>
                </div>
                <div className="mt-2 h-[4px] rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white/70 transition-[width] duration-300"
                    style={{ width: `${processingStatus.status === 'uploading' ? 0 : processingStatus.progress}%` }}
                  />
                </div>
              </div>
            </li>
          )}

          {songs.map(song => {
            const isActive = song.id === currentSongId;
            return (
              <li key={song.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(song.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') handleSelect(song.id);
                  }}
                  className={`group flex items-start gap-2 rounded-[10px] px-4 py-3 cursor-pointer transition-colors duration-200 ${isActive ? 'bg-secondary' : 'bg-white/5 md:hover:bg-white/10'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[1.4rem] text-white break-all">{song.fileName}</div>
                    <div className="text-[1.2rem] text-white/60 mt-1">
                      {formatDate(song.createdAt)}
                      {song.storedSize ? ` ・ ${formatSize(song.storedSize)}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={event => handleRemove(event, song.id, song.fileName)}
                    className="shrink-0 text-[1.6rem] leading-none text-white/50 bg-transparent border-none cursor-pointer md:hover:text-danger"
                    aria-label={`${song.fileName}を削除`}
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}

          {songs.length === 0 && !isJobRunning && (
            <li className="text-[1.3rem] text-white/50 px-2 py-4 leading-relaxed">
              分離した曲はここに保存され、リロードしても残ります。
            </li>
          )}
        </ul>

      </aside>
    </>
  );
};

export default SongList;
