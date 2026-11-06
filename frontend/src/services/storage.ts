import { SavedSong } from '../types';

// 分離済みの曲はサイズが大きい（WAV 6トラックで1曲 数百MB）ため IndexedDB に保存し、
// 分離途中のジョブ情報と「今表示している曲」の参照だけを小さな localStorage に保存する。
// IndexedDB は「曲の情報（小）」と「音声データ（大）」を別ストアに分け、音量変更などで音声データを書き直さないようにしている
const DB_NAME = 'music-separator';
const DB_VERSION = 1;
const SONG_STORE = 'songs';
const TRACK_STORE = 'songTracks';
const PENDING_JOB_KEY = 'music-separator:pendingJob';
const CURRENT_SONG_KEY = 'music-separator:currentSongId';

// ブラウザに保存できる曲数の上限。1曲あたり数百MBになり、端末の空き容量は Web ページから正確に知る方法がないため、曲数で制限する
export const MAX_SONGS = 5;

export type StoredSong = SavedSong;

export type TrackBlobs = { [trackId: string]: Blob };

interface StoredSongTracks {
  id: string;
  trackBlobs: TrackBlobs;
}

export interface PendingJob {
  jobId: string;
  fileName: string;
  fileSize: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SONG_STORE)) {
          db.createObjectStore(SONG_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(TRACK_STORE)) {
          db.createObjectStore(TRACK_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
};

const runTransaction = async <T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    const request = operation(transaction);
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
};

// 曲の情報と音声データは同じトランザクションで保存し、片方だけ残る状態を防ぐ
export const saveSong = async (song: StoredSong, trackBlobs: TrackBlobs): Promise<void> => {
  await runTransaction([SONG_STORE, TRACK_STORE], 'readwrite', transaction => {
    transaction.objectStore(SONG_STORE).put(song);
    transaction.objectStore(TRACK_STORE).put({ id: song.id, trackBlobs } as StoredSongTracks);
  });
};

export const getSong = async (id: string): Promise<StoredSong | undefined> => {
  return runTransaction<StoredSong | undefined>([SONG_STORE], 'readonly', transaction =>
    transaction.objectStore(SONG_STORE).get(id),
  );
};

// 曲一覧用。音声データは読み込まず、曲の情報だけを新しい順で返す
export const listSongs = async (): Promise<StoredSong[]> => {
  const songs = await runTransaction<StoredSong[]>([SONG_STORE], 'readonly', transaction =>
    transaction.objectStore(SONG_STORE).getAll(),
  );
  return (songs ?? []).sort((a, b) => b.createdAt - a.createdAt);
};

export const getTotalBlobSize = (trackBlobs: TrackBlobs): number =>
  Object.values(trackBlobs).reduce((total, blob) => total + blob.size, 0);

export const getSongTracks =async (id: string): Promise<TrackBlobs | undefined> => {
  const record = await runTransaction<StoredSongTracks | undefined>([TRACK_STORE], 'readonly', transaction =>
    transaction.objectStore(TRACK_STORE).get(id),
  );
  return record?.trackBlobs;
};

// 曲の情報（音量・波形など）の一部だけを更新する。音声データには触れない。
// 読み込みと書き込みを同じトランザクションで行い、同時に更新しても片方の変更が消えないようにする
export const updateSong = async (id: string, updates: Partial<Omit<StoredSong, 'id'>>): Promise<void> => {
  await runTransaction([SONG_STORE], 'readwrite', transaction => {
    const store = transaction.objectStore(SONG_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) {
        store.put({ ...request.result, ...updates });
      }
    };
  });
};

export const deleteSong = async (id: string): Promise<void> => {
  await runTransaction([SONG_STORE, TRACK_STORE], 'readwrite', transaction => {
    transaction.objectStore(SONG_STORE).delete(id);
    transaction.objectStore(TRACK_STORE).delete(id);
  });
};

// 容量が逼迫したときにブラウザが勝手にデータを消さないよう、永続化をリクエストする（許可されなくても動作は継続）
export const requestPersistentStorage = async (): Promise<void> => {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // 非対応ブラウザでは何もしない
  }
};

// localStorage はプライベートブラウズ等で例外を投げることがあるため、すべて try/catch で包む
const readValue = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeValue = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // 保存できなくてもアプリ自体は動作させる
  }
};

export const getPendingJob = (): PendingJob | null => {
  const value = readValue(PENDING_JOB_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as PendingJob;
  } catch {
    return null;
  }
};
export const setPendingJob = (job: PendingJob | null) => writeValue(PENDING_JOB_KEY, job ? JSON.stringify(job) : null);

export const getCurrentSongId = (): string | null => readValue(CURRENT_SONG_KEY);
export const setCurrentSongId = (id: string | null) => writeValue(CURRENT_SONG_KEY, id);
