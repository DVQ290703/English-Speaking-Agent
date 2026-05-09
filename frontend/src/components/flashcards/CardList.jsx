import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Play,
  Layers,
  ArrowLeft,
  Image,
  Volume2,
} from 'lucide-react';

const MEDIA_ICON = { image: Image, audio: Volume2 };

function detectMediaType(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

// ── Card Form Dialog (Create / Edit) ──────────────────────────────────────────

function CardFormDialog({ mode = 'create', card, onSubmit, submitting, trigger }) {
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState(card?.front_text || '');
  const [back, setBack] = useState(card?.back_text || '');
  const [tags, setTags] = useState(card?.tags?.join(', ') || '');
  const [mediaFiles, setMediaFiles] = useState([]);

  function handleOpen() {
    if (mode === 'edit' && card) {
      setFront(card.front_text || '');
      setBack(card.back_text || '');
      setTags(card.tags?.join(', ') || '');
    }
    setOpen(true);
  }

  function handleFiles(e) {
    const picked = Array.from(e.target.files || []);
    const valid = [];
    for (const file of picked) {
      const mt = detectMediaType(file);
      if (mt) valid.push({ file, side: 'front', media_type: mt });
    }
    setMediaFiles((prev) => [...prev, ...valid]);
    e.target.value = '';
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onSubmit(
      { front_text: front.trim(), back_text: back.trim(), tags: tagList, mediaFiles },
      () => {
        if (mode === 'create') {
          setFront('');
          setBack('');
          setTags('');
          setMediaFiles([]);
        }
        setOpen(false);
      },
      mode === 'edit' ? card?.id : undefined,
    );
  }

  return (
    <>
      {trigger ? (
        <span
          onClick={(e) => {
            e.stopPropagation();
            handleOpen();
          }}
        >
          {trigger}
        </span>
      ) : (
        <button
          onClick={handleOpen}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
        >
          <Plus className="h-4 w-4" /> Add Card
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-2xl w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold dark:text-white mb-1">
              {mode === 'create' ? 'Add New Card' : 'Edit Card'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">
              Provide the front and back content for this flashcard.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                    Front (Question / Prompt)
                  </label>
                  <textarea
                    value={front}
                    onChange={(e) => setFront(e.target.value)}
                    placeholder="What is..."
                    rows={5}
                    autoFocus
                    className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm dark:text-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow min-h-[150px]"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                    Back (Answer)
                  </label>
                  <textarea
                    value={back}
                    onChange={(e) => setBack(e.target.value)}
                    placeholder="The answer is..."
                    rows={5}
                    className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50 px-3 py-2 text-sm dark:text-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow min-h-[150px]"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  Tags (comma separated)
                </label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g. react, hooks, frontend"
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
              {mode === 'create' && (
                <div className="space-y-2">
                  {mediaFiles.map((item, i) => {
                    const Icon = MEDIA_ICON[item.media_type] || Image;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                      >
                        <Icon className="h-4 w-4 text-gray-500" />
                        <span className="flex-1 truncate text-xs text-gray-600 dark:text-slate-300">
                          {item.file.name}
                        </span>
                        <select
                          value={item.side}
                          onChange={(e) =>
                            setMediaFiles((prev) =>
                              prev.map((m, j) => (j === i ? { ...m, side: e.target.value } : m)),
                            )
                          }
                          className="border rounded px-1.5 py-0.5 text-xs dark:bg-slate-700 dark:border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="front">Front</option>
                          <option value="back">Back</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setMediaFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-blue-600 hover:text-blue-700 w-fit transition-colors">
                    <Plus className="h-4 w-4" /> Add image / audio
                    <input
                      type="file"
                      accept="image/*,audio/*"
                      multiple
                      className="hidden"
                      onChange={handleFiles}
                    />
                  </label>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-all active:scale-95"
                >
                  {mode === 'create' ? 'Save Card' : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </>
  );
}

// ── Delete Card Dialog ────────────────────────────────────────────────────────

function DeleteCardDialog({ cardId, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm flex items-center gap-2 px-3 py-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors w-full"
      >
        <Trash2 className="h-4 w-4" /> Delete Card
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold dark:text-white mb-1">Delete Card</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">
              Are you sure? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(cardId);
                  setOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-all active:scale-95"
              >
                Delete Card
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}

// ── Card Dropdown Menu ────────────────────────────────────────────────────────

function CardDropdown({ card, onEdit, onDelete, submitting }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-1 w-40 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-lg dark:shadow-black/50 z-50 overflow-hidden py-1"
          >
            <CardFormDialog
              mode="edit"
              card={card}
              onSubmit={onEdit}
              submitting={submitting}
              trigger={
                <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 w-full transition-colors text-left">
                  <Edit className="h-4 w-4" /> Edit Card
                </button>
              }
            />
            <div className="border-t border-gray-100 dark:border-slate-800 my-1" />
            <DeleteCardDialog
              cardId={card.id}
              onDelete={(id) => {
                onDelete(id);
                setOpen(false);
              }}
            />
          </motion.div>
        </>
      )}
    </div>
  );
}

// ── Main CardList ─────────────────────────────────────────────────────────────

export default function CardList({
  cards,
  loading,
  deckName,
  onBack,
  onCreateCard,
  onEditCard,
  onDeleteCard,
  onStudy,
  creating,
}) {
  const [search, setSearch] = useState('');
  const filtered =
    cards?.filter(
      (c) =>
        c.front_text.toLowerCase().includes(search.toLowerCase()) ||
        c.back_text.toLowerCase().includes(search.toLowerCase()) ||
        c.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase())),
    ) ?? [];

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04 } },
  };
  const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center justify-center text-gray-500 dark:text-slate-400 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="flex-1 text-2xl font-bold dark:text-white">{deckName || 'Cards'}</h2>
        <button
          onClick={onStudy}
          disabled={!cards?.length}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
        >
          <Play className="h-4 w-4" /> Study Deck
        </button>
      </div>

      {/* Search & Add */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="Search cards or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-8 pr-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white max-w-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
        </div>
        <CardFormDialog mode="create" onSubmit={onCreateCard} submitting={creating} />
      </div>

      {/* Cards */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 w-full rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
          {filtered.map((card) => (
            <motion.div
              key={card.id}
              variants={item}
              className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col md:flex-row">
                <div className="flex-1 p-4 border-b md:border-b-0 md:border-r border-gray-100 dark:border-slate-800">
                  <div className="text-xs font-medium text-gray-400 dark:text-slate-500 mb-2 tracking-wider">
                    FRONT
                  </div>
                  <div className="text-sm dark:text-white whitespace-pre-wrap">
                    {card.front_text}
                  </div>
                  {card.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {card.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 px-2 py-0.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1 p-4 bg-gray-50/50 dark:bg-slate-800/30 relative">
                  <div className="absolute top-2 right-2">
                    <CardDropdown
                      card={card}
                      onEdit={onEditCard}
                      onDelete={onDeleteCard}
                      submitting={creating}
                    />
                  </div>
                  <div className="text-xs font-medium text-gray-400 dark:text-slate-500 mb-2 tracking-wider">
                    BACK
                  </div>
                  <div className="text-sm dark:text-slate-200 pr-8 whitespace-pre-wrap">
                    {card.back_text}
                  </div>
                  {card.media?.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {card.media.map((m) => {
                        const Icon = MEDIA_ICON[m.media_type] || Image;
                        return (
                          <span
                            key={m.id}
                            className="text-xs text-gray-400 flex items-center gap-1"
                          >
                            <Icon className="h-3.5 w-3.5" />{' '}
                            <span className="capitalize">{m.side}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl bg-gray-50/50 dark:bg-slate-900/50">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <Layers className="h-6 w-6 text-gray-400 dark:text-slate-500" />
          </div>
          <h3 className="text-lg font-medium dark:text-white">No cards found</h3>
          <p className="text-gray-500 dark:text-slate-400 max-w-sm mb-4 text-sm">
            {search
              ? 'No cards match your search.'
              : 'This deck is empty. Add some cards to start studying.'}
          </p>
          {!search && (
            <CardFormDialog mode="create" onSubmit={onCreateCard} submitting={creating} />
          )}
        </div>
      )}
    </div>
  );
}
