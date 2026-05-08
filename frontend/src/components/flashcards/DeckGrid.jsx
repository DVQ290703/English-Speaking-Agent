import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, MoreVertical, Edit, Trash2, Play, Layers, BookOpen, ChevronRight, Library } from 'lucide-react';

const DECK_COLORS = [
  'from-blue-500 to-blue-600', 'from-violet-500 to-violet-600',
  'from-emerald-500 to-emerald-600', 'from-orange-500 to-orange-600',
  'from-rose-500 to-rose-600', 'from-cyan-500 to-cyan-600',
  'from-amber-500 to-amber-600', 'from-indigo-500 to-indigo-600',
];

function hashColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return DECK_COLORS[Math.abs(h) % DECK_COLORS.length];
}

function initials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// ── Deck Form Dialog (Create / Edit) ──────────────────────────────────────────

function DeckFormDialog({ mode = 'create', deck, onSubmit, submitting, trigger }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(deck?.name || '');
  const [desc, setDesc] = useState(deck?.description || '');

  function handleOpen() {
    if (mode === 'edit' && deck) { setName(deck.name || ''); setDesc(deck.description || ''); }
    setOpen(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(
      { name: name.trim(), description: desc.trim() || undefined },
      () => { if (mode === 'create') { setName(''); setDesc(''); } setOpen(false); },
      mode === 'edit' ? deck?.id : undefined
    );
  }

  return (
    <>
      {trigger ? (
        <span onClick={(e) => { e.stopPropagation(); handleOpen(); }}>{trigger}</span>
      ) : (
        <button onClick={handleOpen}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shrink-0 shadow-sm hover:shadow-md active:scale-95">
          <Plus className="h-4 w-4" /> New Deck
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => setOpen(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold dark:text-white mb-1">{mode === 'create' ? 'Create New Deck' : 'Edit Deck'}</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">{mode === 'create' ? 'Organize your flashcards into a new collection.' : 'Update your deck details.'}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., IELTS Vocabulary" autoFocus
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">Description</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description..." rows={3}
                  className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm dark:text-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow" />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-all active:scale-95">{mode === 'create' ? 'Create Deck' : 'Save Changes'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </>
  );
}

// ── Delete Deck Dialog ────────────────────────────────────────────────────────

function DeleteDeckDialog({ deckId, deckName, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm flex items-center gap-2 px-3 py-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors w-full">
        <Trash2 className="h-4 w-4" /> Delete Deck
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold dark:text-white mb-1">Delete Deck</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">
              Are you sure you want to delete <span className="font-semibold text-gray-700 dark:text-white">{deckName}</span>? This will delete the deck and all its cards.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button onClick={() => { onDelete(deckId); setOpen(false); }} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-all active:scale-95">Delete Deck</button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}

// ── Dropdown Menu ─────────────────────────────────────────────────────────────

function DeckDropdown({ deck, onEdit, onDelete, submitting }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(v => !v)}
        className="opacity-0 group-hover:opacity-100 h-8 w-8 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-all">
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.15 }}
            className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-lg dark:shadow-black/50 z-50 overflow-hidden py-1">
            <DeckFormDialog mode="edit" deck={deck} onSubmit={onEdit} submitting={submitting}
              trigger={
                <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 w-full transition-colors text-left">
                  <Edit className="h-4 w-4" /> Edit Deck
                </button>
              }
            />
            <div className="border-t border-gray-100 dark:border-slate-800 my-1" />
            <DeleteDeckDialog deckId={deck.id} deckName={deck.name} onDelete={(id) => { onDelete(id); setOpen(false); }} />
          </motion.div>
        </>
      )}
    </div>
  );
}

// ── Main DeckGrid ─────────────────────────────────────────────────────────────

export default function DeckGrid({ decks, loading, onSelectDeck, onDeleteDeck, onCreateDeck, onEditDeck, onStudyDeck, creating }) {
  const [search, setSearch] = useState('');
  const filtered = decks?.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.description ?? '').toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } } };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold dark:text-white">Decks</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {decks ? `${decks.length} collection${decks.length !== 1 ? 's' : ''}` : 'Loading...'}
          </p>
        </div>
        <div className="flex w-full sm:w-auto items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input type="search" placeholder="Search decks..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow" />
          </div>
          <DeckFormDialog mode="create" onSubmit={onCreateDeck} submitting={creating} />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-52 rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />)}
        </div>
      ) : filtered.length > 0 ? (
        <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(deck => {
            const color = hashColor(deck.id);
            const ini = initials(deck.name);
            const hasDue = (deck.due_count ?? 0) > 0;
            return (
              <motion.div key={deck.id} variants={item}>
                <div className="group relative rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden cursor-pointer hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200"
                  onClick={() => onSelectDeck(deck.id)}>
                  <div className={`h-2 w-full bg-gradient-to-r ${color}`} />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>{ini}</div>
                      <DeckDropdown deck={deck} onEdit={onEditDeck} onDelete={onDeleteDeck} submitting={creating} />
                    </div>
                    <div className="mt-3 space-y-1">
                      <h3 className="font-semibold text-base leading-tight line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors dark:text-white">{deck.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-slate-400 line-clamp-2 min-h-[2.5rem]">{deck.description || 'No description.'}</p>
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400"><Layers className="h-3.5 w-3.5" /> {deck.card_count ?? 0} cards</span>
                      {hasDue && <span className="flex items-center gap-1.5 text-orange-500 font-medium"><Play className="h-3.5 w-3.5 fill-orange-500" /> {deck.due_count} due today</span>}
                    </div>
                    <div className="mt-4 flex gap-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => onStudyDeck(deck.id)}
                        className={`flex-1 h-9 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 active:scale-95 ${hasDue ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'}`}>
                        <Play className="h-3.5 w-3.5" /> {hasDue ? 'Study now' : 'Review'}
                      </button>
                      <button onClick={() => onSelectDeck(deck.id)} title="Manage cards"
                        className="h-9 w-9 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors active:scale-95">
                        <BookOpen className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                      </button>
                    </div>
                  </div>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 opacity-0 group-hover:opacity-30 transition-opacity pointer-events-none">
                    <ChevronRight className="h-5 w-5" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl bg-gray-50 dark:bg-slate-900/50">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <Library className="h-8 w-8 text-gray-400 dark:text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold dark:text-white">No decks found</h3>
          <p className="text-gray-500 dark:text-slate-400 max-w-xs mb-6 mt-1 text-sm">
            {search ? `No results for "${search}"` : 'Create your first deck to start learning.'}
          </p>
          {!search && <DeckFormDialog mode="create" onSubmit={onCreateDeck} submitting={creating} />}
        </div>
      )}
    </div>
  );
}
