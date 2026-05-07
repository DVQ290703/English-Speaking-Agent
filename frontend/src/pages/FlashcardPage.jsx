import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthSession } from '../auth/tokenStorage';
import {
  createCard, createCardWithMedia, createDeck, deleteDeck, getDeckStats, getDueCards,
  listCards, listDecks, submitReview,
} from '../api/flashcards';

const TABS = ['Decks', 'Cards', 'Review', 'Stats'];
const RATINGS = ['again', 'hard', 'good', 'easy'];
const RATING_COLOR = {
  again: 'bg-red-500 hover:bg-red-600',
  hard:  'bg-orange-400 hover:bg-orange-500',
  good:  'bg-blue-500 hover:bg-blue-600',
  easy:  'bg-green-500 hover:bg-green-600',
};

function useToken() {
  return getAuthSession()?.token ?? null;
}

function Spinner() {
  return <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />;
}

function Alert({ msg, type = 'error' }) {
  if (!msg) return null;
  const cls = type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200';
  return <div className={`text-sm px-3 py-2 rounded border ${cls}`}>{msg}</div>;
}

// ── Decks Tab ─────────────────────────────────────────────────────────────────

function DecksTab({ selectedDeckId, onSelectDeck }) {
  const token = useToken();
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setDecks(await listDecks(token)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createDeck(token, { name: name.trim(), description: desc.trim() || undefined });
      setName(''); setDesc('');
      await load();
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this deck?')) return;
    try { await deleteDeck(token, id); await load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2 flex-wrap">
        <input
          className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[140px] dark:bg-slate-800 dark:border-slate-600"
          placeholder="Deck name *"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[140px] dark:bg-slate-800 dark:border-slate-600"
          placeholder="Description (optional)"
          value={desc}
          onChange={e => setDesc(e.target.value)}
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
        >
          {creating ? '...' : '+ Create'}
        </button>
      </form>
      <Alert msg={error} />
      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {decks.length === 0 && <p className="text-sm text-slate-400">No decks yet.</p>}
          {decks.map(d => (
            <div
              key={d.id}
              onClick={() => onSelectDeck(d.id)}
              className={`flex items-center justify-between px-4 py-3 rounded-lg border cursor-pointer transition
                ${selectedDeckId === d.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'}`}
            >
              <div>
                <p className="font-medium text-sm">{d.name}</p>
                {d.description && <p className="text-xs text-slate-400 mt-0.5">{d.description}</p>}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>{d.card_count} cards</span>
                {d.due_count > 0 && (
                  <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded">{d.due_count} due</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(d.id); }}
                  className="text-red-400 hover:text-red-600 px-1"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cards Tab ─────────────────────────────────────────────────────────────────

const MEDIA_TYPE_ICONS = { image: '🖼', audio: '🔊' };

function detectMediaType(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

function MediaFileRow({ item, index, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded px-3 py-2 text-sm">
      <span className="text-base">{MEDIA_TYPE_ICONS[item.media_type] ?? '📎'}</span>
      <span className="flex-1 truncate text-slate-700 dark:text-slate-300 text-xs">{item.file.name}</span>
      <select
        value={item.side}
        onChange={e => onChange(index, 'side', e.target.value)}
        className="border rounded px-1.5 py-0.5 text-xs dark:bg-slate-700 dark:border-slate-600"
      >
        <option value="front">Front</option>
        <option value="back">Back</option>
      </select>
      <span className="text-xs text-slate-400 capitalize">{item.media_type}</span>
      <button type="button" onClick={() => onRemove(index)} className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
    </div>
  );
}

function CardsTab({ selectedDeckId }) {
  const token = useToken();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [tags, setTags] = useState('');
  const [mediaFiles, setMediaFiles] = useState([]); // [{ file, side, media_type }]
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!selectedDeckId) return;
    setLoading(true); setError('');
    try { setCards(await listCards(token, selectedDeckId)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, selectedDeckId]);

  useEffect(() => { load(); }, [load]);

  function handleFilesPick(e) {
    const picked = Array.from(e.target.files || []);
    const valid = [];
    for (const file of picked) {
      const media_type = detectMediaType(file);
      if (!media_type) { setError(`"${file.name}" is not a supported image or audio file.`); continue; }
      valid.push({ file, side: 'front', media_type });
    }
    setMediaFiles(prev => [...prev, ...valid]);
    e.target.value = '';
  }

  function handleMediaChange(index, key, value) {
    setMediaFiles(prev => prev.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }

  function handleMediaRemove(index) {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    setCreating(true); setError('');
    try {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (mediaFiles.length > 0) {
        await createCardWithMedia(token, selectedDeckId, {
          front_text: front.trim(),
          back_text: back.trim(),
          tags: tagList,
          mediaFiles,
        });
      } else {
        await createCard(token, selectedDeckId, {
          front_text: front.trim(),
          back_text: back.trim(),
          tags: tagList,
        });
      }
      setFront(''); setBack(''); setTags(''); setMediaFiles([]);
      await load();
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  }

  if (!selectedDeckId) {
    return <p className="text-sm text-slate-400">Select a deck from the Decks tab first.</p>;
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="space-y-2">
        <div className="flex gap-2">
          <input
            className="border rounded px-3 py-1.5 text-sm flex-1 dark:bg-slate-800 dark:border-slate-600"
            placeholder="Front (word / phrase) *"
            value={front}
            onChange={e => setFront(e.target.value)}
          />
          <input
            className="border rounded px-3 py-1.5 text-sm flex-1 dark:bg-slate-800 dark:border-slate-600"
            placeholder="Back (definition) *"
            value={back}
            onChange={e => setBack(e.target.value)}
          />
        </div>
        <input
          className="border rounded px-3 py-1.5 text-sm w-full dark:bg-slate-800 dark:border-slate-600"
          placeholder="Tags (comma-separated, optional)"
          value={tags}
          onChange={e => setTags(e.target.value)}
        />

        {/* Media section */}
        <div className="space-y-1.5">
          {mediaFiles.map((item, i) => (
            <MediaFileRow key={i} item={item} index={i} onChange={handleMediaChange} onRemove={handleMediaRemove} />
          ))}
          <label className="flex items-center gap-2 cursor-pointer text-sm text-blue-600 hover:text-blue-700 w-fit">
            <span>+ Add image / audio</span>
            <input
              type="file"
              accept="image/*,audio/*"
              multiple
              className="hidden"
              onChange={handleFilesPick}
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={creating || !front.trim() || !back.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            {creating ? '...' : `+ Add Card${mediaFiles.length > 0 ? ` (${mediaFiles.length} file${mediaFiles.length > 1 ? 's' : ''})` : ''}`}
          </button>
        </div>
      </form>
      <Alert msg={error} />
      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {cards.length === 0 && <p className="text-sm text-slate-400">No cards yet.</p>}
          {cards.map(c => (
            <div key={c.id} className="flex items-start justify-between px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="space-y-0.5 flex-1 min-w-0">
                <p className="text-sm font-medium">{c.front_text}</p>
                <p className="text-xs text-slate-500">{c.back_text}</p>
                {c.tags?.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {c.tags.map(t => (
                      <span key={t} className="text-xs bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                )}
                {c.media?.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-1">
                    {c.media.map(m => (
                      <span key={m.id} className="text-xs text-slate-400 flex items-center gap-0.5">
                        {MEDIA_TYPE_ICONS[m.media_type]} <span className="capitalize">{m.side}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {c.media?.length > 0 && (
                <span className="text-xs text-slate-400 ml-2 shrink-0">📎 {c.media.length}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card Media Renderer ───────────────────────────────────────────────────────

function CardMedia({ media, side }) {
  const items = (media || []).filter(m => m.side === side);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2 mt-2">
      {items.map(m => {
        if (m.media_type === 'image') {
          return (
            <img
              key={m.id}
              src={m.public_url}
              alt=""
              className="max-h-48 max-w-full rounded-lg object-contain"
            />
          );
        }
        if (m.media_type === 'audio') {
          return (
            <audio key={m.id} controls className="w-full max-w-xs">
              <source src={m.public_url} type={m.mime_type} />
            </audio>
          );
        }
        return null;
      })}
    </div>
  );
}

// ── Review Tab ────────────────────────────────────────────────────────────────

function ReviewTab({ selectedDeckId }) {
  const token = useToken();
  const [cards, setCards] = useState([]);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setDone(false); setCurrent(0); setFlipped(false); setResult(null);
    try { setCards(await getDueCards(token, selectedDeckId)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, selectedDeckId]);

  useEffect(() => { load(); }, [load]);

  async function handleRate(rating) {
    const card = cards[current];
    setSubmitting(true); setError('');
    try {
      const res = await submitReview(token, card.id, rating);
      setResult(res);
      setTimeout(() => {
        setResult(null);
        if (current + 1 >= cards.length) { setDone(true); }
        else { setCurrent(c => c + 1); setFlipped(false); }
      }, 800);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  if (loading) return <Spinner />;
  if (error) return <Alert msg={error} />;
  if (done || cards.length === 0) {
    return (
      <div className="text-center py-10 space-y-3">
        <p className="text-2xl">🎉</p>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {cards.length === 0 ? 'No cards due for review!' : 'All done for today!'}
        </p>
        <button onClick={load} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm">Reload</button>
      </div>
    );
  }

  const card = cards[current];
  return (
    <div className="space-y-4">
      <div className="flex justify-between text-xs text-slate-400">
        <span>Card {current + 1} of {cards.length}</span>
        <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{card.deck_name}</span>
      </div>

      {/* Card */}
      <div
        onClick={() => !submitting && setFlipped(f => !f)}
        className="min-h-[160px] border-2 border-slate-200 dark:border-slate-600 rounded-xl flex items-center justify-center cursor-pointer select-none transition hover:border-blue-300 dark:hover:border-blue-600"
      >
        <div className="text-center px-6 py-8 space-y-2">
          {!flipped ? (
            <>
              <p className="text-xl font-semibold">{card.front_text}</p>
              <CardMedia media={card.media} side="front" />
              <p className="text-xs text-slate-400">tap to reveal</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500 font-medium uppercase tracking-wide">Answer</p>
              <p className="text-base">{card.back_text}</p>
              <CardMedia media={card.media} side="back" />
            </>
          )}
        </div>
      </div>

      {/* Rating buttons — only show after flip */}
      {flipped && (
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map(r => (
            <button
              key={r}
              disabled={submitting}
              onClick={() => handleRate(r)}
              className={`py-2 rounded text-white text-sm font-medium capitalize disabled:opacity-50 ${RATING_COLOR[r]}`}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {result && (
        <Alert
          msg={`Next review in ${result.interval_days} day${result.interval_days !== 1 ? 's' : ''} · EF ${result.ease_factor}`}
          type="success"
        />
      )}
      <Alert msg={error} />
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

function StatsTab({ selectedDeckId }) {
  const token = useToken();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!selectedDeckId) return;
    setLoading(true); setError('');
    try { setStats(await getDeckStats(token, selectedDeckId)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, selectedDeckId]);

  useEffect(() => { load(); }, [load]);

  if (!selectedDeckId) return <p className="text-sm text-slate-400">Select a deck first.</p>;
  if (loading) return <Spinner />;
  if (error) return <Alert msg={error} />;
  if (!stats) return null;

  const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: 'Total Cards', value: stats.total_cards, color: 'text-slate-700 dark:text-slate-200' },
        { label: 'Due Today', value: stats.due_today, color: 'text-red-600' },
        { label: 'Learned', value: `${stats.learned} (${pct(stats.learned, stats.total_cards)}%)`, color: 'text-blue-600' },
        { label: '30d Retention', value: `${Math.round(stats.retention_rate * 100)}%`, color: 'text-green-600' },
      ].map(({ label, value, color }) => (
        <div key={label} className="border rounded-xl px-4 py-4 text-center dark:border-slate-700">
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          <p className="text-xs text-slate-400 mt-1">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FlashcardPage() {
  const navigate = useNavigate();
  const token = useToken();
  const [tab, setTab] = useState(0);
  const [selectedDeckId, setSelectedDeckId] = useState(null);

  useEffect(() => {
    if (!token) navigate('/');
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-slate-950 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold dark:text-white">Flashcards</h1>
            {selectedDeckId && (
              <p className="text-xs text-slate-400 mt-0.5">
                deck: <span className="font-mono">{selectedDeckId.slice(0, 8)}…</span>
              </p>
            )}
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >← Dashboard</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={`flex-1 py-1.5 text-sm rounded-md transition font-medium
                ${tab === i
                  ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
          {tab === 0 && <DecksTab selectedDeckId={selectedDeckId} onSelectDeck={setSelectedDeckId} />}
          {tab === 1 && <CardsTab selectedDeckId={selectedDeckId} />}
          {tab === 2 && <ReviewTab selectedDeckId={selectedDeckId} />}
          {tab === 3 && <StatsTab selectedDeckId={selectedDeckId} />}
        </div>
      </div>
    </div>
  );
}
