// frontend/src/lib/db.ts
// IndexedDB schema and CRUD helpers.
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'vin-agent-v1';
const DB_VERSION = 1;

export interface ConversationRecord {
  id: string;
  title: string | null;
  status: string;
  topic_id: string | null;
  started_at: string;
  ended_at: string | null;
  cleared_at: string | null;
  cached_at: string;
}

export interface MessageRecord {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  input_mode: string | null;
  text_content: string | null;
  created_at: string;
  storage_key: string | null;
}

export interface ScoreRecord {
  message_id: string;
  conversation_id: string;
  overall_score: number;
  accuracy_score: number;
  fluency_score: number;
  completeness_score: number | null;
  prosody_score: number | null;
  created_at: string;
}

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
      convStore.createIndex('by_started_at', 'started_at');

      const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
      msgStore.createIndex('by_conv_created', ['conversation_id', 'created_at']);

      const scoreStore = db.createObjectStore('scores', { keyPath: 'message_id' });
      scoreStore.createIndex('by_conversation', 'conversation_id');
    },
  });
  return _db;
}

export async function dbGetConversations(): Promise<ConversationRecord[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('conversations', 'by_started_at');
  return all.reverse();
}

export async function dbUpsertConversations(convs: ConversationRecord[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('conversations', 'readwrite');
  await Promise.all([...convs.map(c => tx.store.put(c)), tx.done]);
}

export async function dbSetConversationCleared(
  conversationId: string,
  clearedAt: string
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('conversations', 'readwrite');
  const existing = await tx.store.get(conversationId);
  if (existing) {
    await tx.store.put({ ...existing, cleared_at: clearedAt });
  }
  await tx.done;
}

export async function dbGetMessages(conversationId: string): Promise<MessageRecord[]> {
  const db = await getDB();
  const tx = db.transaction('messages', 'readonly');
  const index = tx.store.index('by_conv_created');
  const range = IDBKeyRange.bound(
    [conversationId, ''],
    [conversationId, '\uffff']
  );
  return index.getAll(range);
}

export async function dbUpsertMessages(messages: MessageRecord[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  await Promise.all([...messages.map(m => tx.store.put(m)), tx.done]);
}

export async function dbDeleteMessages(conversationId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  const index = tx.store.index('by_conv_created');
  const range = IDBKeyRange.bound([conversationId, ''], [conversationId, '\uffff']);
  let cursor = await index.openCursor(range);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function dbGetScores(conversationId: string): Promise<ScoreRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('scores', 'by_conversation', conversationId);
}

export async function dbUpsertScore(score: ScoreRecord): Promise<void> {
  const db = await getDB();
  await db.put('scores', score);
}

export async function dbClearConversationData(
  conversationId: string,
  clearedAt: string
): Promise<void> {
  await Promise.all([
    dbSetConversationCleared(conversationId, clearedAt),
    dbDeleteMessages(conversationId),
  ]);
}
