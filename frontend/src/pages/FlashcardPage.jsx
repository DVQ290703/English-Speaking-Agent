import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { getAuthSession } from '../auth/tokenStorage';
import {
  createCard, createCardWithMedia, createDeck, deleteDeck, updateDeck,
  getDeckStats, getDueCards, listCards, listDecks, submitReview,
  updateCard, deleteCard,
} from '../api/flashcards';
import DeckGrid from '../components/flashcards/DeckGrid';
import CardList from '../components/flashcards/CardList';
import StudyMode from '../components/flashcards/StudyMode';

function useToken() {
  return getAuthSession()?.token ?? null;
}

// ── Stats View ────────────────────────────────────────────────────────────────

function StatsView({ token, deckId, deckName, onBack }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!deckId) return;
    setLoading(true); setError('');
    try { setStats(await getDeckStats(token, deckId)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, deckId]);

  useEffect(() => { load(); }, [load]);

  if (!deckId) return <p className="text-sm text-gray-400 dark:text-slate-500">Select a deck first.</p>;
  if (loading) return <div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" /></div>;
  if (error) return <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-4 py-2 rounded-xl">{error}</div>;
  if (!stats) return null;

  const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="w-10 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center justify-center text-gray-500 transition-colors text-lg">←</button>
        <h2 className="text-2xl font-bold dark:text-white">Stats — {deckName}</h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Cards', value: stats.total_cards, color: 'text-gray-700 dark:text-slate-200', bg: 'bg-gray-50 dark:bg-slate-800' },
          { label: 'Due Today', value: stats.due_today, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-500/10' },
          { label: 'Learned', value: `${stats.learned} (${pct(stats.learned, stats.total_cards)}%)`, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-500/10' },
          { label: '30d Retention', value: `${Math.round(stats.retention_rate * 100)}%`, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-500/10' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl px-5 py-5 text-center border border-gray-100 dark:border-slate-700`}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5 font-medium">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FlashcardPage() {
  const navigate = useNavigate();
  const token = useToken();

  // Views: 'decks' | 'cards' | 'study' | 'stats'
  const [view, setView] = useState('decks');
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [selectedDeckName, setSelectedDeckName] = useState('');

  // Decks state
  const [decks, setDecks] = useState([]);
  const [decksLoading, setDecksLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Cards state
  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardCreating, setCardCreating] = useState(false);

  // Study state
  const [dueCards, setDueCards] = useState([]);

  useEffect(() => {
    if (!token) navigate('/');
  }, [token, navigate]);

  // Load decks
  const loadDecks = useCallback(async () => {
    if (!token) return;
    setDecksLoading(true);
    try { setDecks(await listDecks(token)); }
    catch { /* ignore */ }
    finally { setDecksLoading(false); }
  }, [token]);

  useEffect(() => { loadDecks(); }, [loadDecks]);

  // Load cards when viewing a deck
  const loadCards = useCallback(async (deckId) => {
    if (!deckId || !token) return;
    setCardsLoading(true);
    try { setCards(await listCards(token, deckId)); }
    catch { /* ignore */ }
    finally { setCardsLoading(false); }
  }, [token]);

  // ── Deck Handlers ───────────────────────────────────────────────────────────

  function handleSelectDeck(deckId) {
    const deck = decks.find(d => d.id === deckId);
    setSelectedDeckId(deckId);
    setSelectedDeckName(deck?.name || '');
    setView('cards');
    loadCards(deckId);
  }

  async function handleCreateDeck(data, onDone) {
    setCreating(true);
    try {
      await createDeck(token, data);
      await loadDecks();
      toast.success('Deck created successfully.');
      onDone?.();
    } catch (e) { toast.error(e.message || 'Failed to create deck.'); }
    finally { setCreating(false); }
  }

  async function handleEditDeck(data, onDone, deckId) {
    setCreating(true);
    try {
      await updateDeck(token, deckId, data);
      await loadDecks();
      toast.success('Deck updated successfully.');
      onDone?.();
    } catch (e) { toast.error(e.message || 'Failed to update deck.'); }
    finally { setCreating(false); }
  }

  async function handleDeleteDeck(deckId) {
    try {
      await deleteDeck(token, deckId);
      await loadDecks();
      toast.success('Deck deleted.');
    } catch (e) { toast.error(e.message || 'Failed to delete deck.'); }
  }

  async function handleStudyDeck(deckId) {
    const deck = decks.find(d => d.id === deckId);
    setSelectedDeckId(deckId);
    setSelectedDeckName(deck?.name || '');
    try {
      const due = await getDueCards(token, deckId);
      setDueCards(due || []);
      setView('study');
    } catch { setDueCards([]); setView('study'); }
  }

  // ── Card Handlers ───────────────────────────────────────────────────────────

  async function handleCreateCard(data, onDone) {
    setCardCreating(true);
    try {
      if (data.mediaFiles?.length > 0) {
        await createCardWithMedia(token, selectedDeckId, data);
      } else {
        await createCard(token, selectedDeckId, data);
      }
      await loadCards(selectedDeckId);
      toast.success('Card added.');
      onDone?.();
    } catch (e) { toast.error(e.message || 'Failed to add card.'); }
    finally { setCardCreating(false); }
  }

  async function handleEditCard(data, onDone, cardId) {
    setCardCreating(true);
    try {
      await updateCard(token, cardId, data);
      await loadCards(selectedDeckId);
      toast.success('Card updated.');
      onDone?.();
    } catch (e) { toast.error(e.message || 'Failed to update card.'); }
    finally { setCardCreating(false); }
  }

  async function handleDeleteCard(cardId) {
    try {
      await deleteCard(token, cardId);
      await loadCards(selectedDeckId);
      toast.success('Card deleted.');
    } catch (e) { toast.error(e.message || 'Failed to delete card.'); }
  }

  // ── Review Handler ──────────────────────────────────────────────────────────

  async function handleSubmitReview(cardId, rating) {
    try { await submitReview(token, cardId, rating); }
    catch { /* ignore */ }
  }

  function handleStudyClose() {
    setView('decks');
    loadDecks();
  }

  // Study mode — full screen overlay
  if (view === 'study') {
    return <StudyMode cards={dueCards} onSubmitReview={handleSubmitReview} onClose={handleStudyClose} />;
  }

  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-slate-950 text-gray-900 dark:text-slate-100">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs">FC</div>
            <span className="text-base font-semibold">Flashcards</span>
          </div>
          <div className="flex items-center gap-2">
            {view === 'cards' && selectedDeckId && (
              <button onClick={() => setView('stats')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 font-medium transition-colors">
                <BarChart3 className="h-4 w-4" /> Stats
              </button>
            )}
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium transition-colors">
              <ArrowLeft className="h-4 w-4" /> Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {view === 'decks' && (
          <DeckGrid
            decks={decks}
            loading={decksLoading}
            onSelectDeck={handleSelectDeck}
            onDeleteDeck={handleDeleteDeck}
            onCreateDeck={handleCreateDeck}
            onEditDeck={handleEditDeck}
            onStudyDeck={handleStudyDeck}
            creating={creating}
          />
        )}

        {view === 'cards' && (
          <CardList
            cards={cards}
            loading={cardsLoading}
            deckName={selectedDeckName}
            onBack={() => { setView('decks'); loadDecks(); }}
            onCreateCard={handleCreateCard}
            onEditCard={handleEditCard}
            onDeleteCard={handleDeleteCard}
            onStudy={() => handleStudyDeck(selectedDeckId)}
            creating={cardCreating}
          />
        )}

        {view === 'stats' && (
          <StatsView
            token={token}
            deckId={selectedDeckId}
            deckName={selectedDeckName}
            onBack={() => setView('cards')}
          />
        )}
      </div>
    </div>
  );
}
