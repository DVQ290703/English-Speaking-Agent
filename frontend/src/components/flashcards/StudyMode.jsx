import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2 } from 'lucide-react';

const RATINGS = ['again', 'hard', 'good', 'easy'];
const RATING_STYLES = {
  again: { bg: '#dc2626', hover: '#b91c1c', tint: 'rgba(239,68,68,0.06)' },
  hard: { bg: '#d97706', hover: '#b45309', tint: 'rgba(245,158,11,0.06)' },
  good: { bg: '#2563eb', hover: '#1d4ed8', tint: 'rgba(59,130,246,0.06)' },
  easy: { bg: '#16a34a', hover: '#15803d', tint: 'rgba(34,197,94,0.06)' },
};

function CardMedia({ media, side }) {
  const items = (media || []).filter((m) => m.side === side);
  if (!items.length) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
      }}
    >
      {items.map((m) => {
        if (m.media_type === 'image') {
          return (
            <img
              key={m.id}
              src={m.public_url}
              alt=""
              style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 12, objectFit: 'contain' }}
            />
          );
        }
        if (m.media_type === 'audio') {
          return (
            <audio key={m.id} controls style={{ width: '100%', maxWidth: 280 }}>
              <source src={m.public_url} type={m.mime_type} />
            </audio>
          );
        }
        return null;
      })}
    </div>
  );
}

export default function StudyMode({ cards: initialCards, onSubmitReview, onClose }) {
  const [queue, setQueue] = useState(initialCards || []);
  const [initialTotal] = useState(initialCards?.length || 0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [bgTint, setBgTint] = useState('transparent');
  const [touchStart, setTouchStart] = useState(null);

  const currentCard = queue[0];
  const progress = initialTotal > 0 ? ((initialTotal - queue.length) / initialTotal) * 100 : 0;

  const handleFlip = useCallback(() => {
    if (!isFlipped && queue.length > 0) setIsFlipped(true);
  }, [isFlipped, queue.length]);

  const handleRating = useCallback(
    (rating) => {
      if (!currentCard || !isFlipped) return;
      if (navigator.vibrate) navigator.vibrate(15);
      setBgTint(RATING_STYLES[rating].tint);
      setTimeout(() => setBgTint('transparent'), 500);
      setQueue((prev) => prev.slice(1));
      setIsFlipped(false);
      onSubmitReview?.(currentCard.id, rating);
    },
    [currentCard, isFlipped, onSubmitReview],
  );

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.code === 'Space') {
        e.preventDefault();
        handleFlip();
      } else if (isFlipped) {
        if (e.key === '1') handleRating('again');
        if (e.key === '2') handleRating('hard');
        if (e.key === '3') handleRating('good');
        if (e.key === '4') handleRating('easy');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleFlip, handleRating, isFlipped]);

  const onTouchStart = (e) => setTouchStart(e.targetTouches[0].clientX);
  const onTouchEnd = (e) => {
    if (!touchStart || !isFlipped) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (diff > 50) handleRating('again');
    else if (diff < -50) handleRating('good');
    setTouchStart(null);
  };

  // Session complete
  if (queue.length === 0 && initialTotal > 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f5f7fa] dark:bg-slate-950 p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md text-center space-y-6"
        >
          <div className="mx-auto w-24 h-24 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight dark:text-white">Session Complete</h2>
            <p className="text-gray-500 dark:text-slate-400 mt-2">
              You&apos;ve reviewed all {initialTotal} cards.
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Back to Flashcards
          </button>
        </motion.div>
      </div>
    );
  }

  // No cards
  if (initialTotal === 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f5f7fa] dark:bg-slate-950 p-6">
        <div className="max-w-md text-center space-y-6">
          <CheckCircle2 className="w-16 h-16 text-gray-400 dark:text-slate-500 opacity-50 mx-auto" />
          <h2 className="text-2xl font-semibold dark:text-white">No Cards Due</h2>
          <p className="text-gray-500 dark:text-slate-400">You&apos;re all caught up!</p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col transition-colors duration-300"
      style={{ background: bgTint !== 'transparent' ? bgTint : '' }}
    >
      <div className="bg-[#f5f7fa] dark:bg-slate-950 absolute inset-0 -z-10" />
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full hover:bg-gray-200 dark:hover:bg-slate-800 flex items-center justify-center text-gray-500 dark:text-slate-400 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 max-w-sm mx-4">
          <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 mb-2 font-medium">
            <span>
              {initialTotal - queue.length} / {initialTotal}
            </span>
            <span>{queue.length} remaining</span>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-600 rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          </div>
        </div>
        <div className="w-10" />
      </div>

      {/* Card Area */}
      <div
        className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden"
        style={{ perspective: '1000px' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <AnimatePresence mode="wait">
          {currentCard && (
            <motion.div
              key={currentCard.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl cursor-pointer"
              style={{ aspectRatio: '4/3', maxHeight: '60vh' }}
              onClick={handleFlip}
            >
              <motion.div
                className="w-full h-full relative"
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Front */}
                <div
                  className="absolute inset-0 w-full h-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-xl flex items-center justify-center p-8 md:p-12"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <div className="text-center">
                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 tracking-widest block mb-6">
                      QUESTION
                    </span>
                    <div className="text-xl md:text-3xl font-medium leading-relaxed dark:text-white">
                      {currentCard.front_text}
                    </div>
                    <CardMedia media={currentCard.media} side="front" />
                  </div>
                  {!isFlipped && (
                    <div className="absolute bottom-6 left-0 right-0 text-center text-sm text-gray-400 dark:text-slate-500 animate-pulse">
                      Tap or press Space to reveal
                    </div>
                  )}
                </div>
                {/* Back */}
                <div
                  className="absolute inset-0 w-full h-full bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-800 rounded-2xl shadow-xl flex items-center justify-center p-8 md:p-12 overflow-y-auto"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  <div className="text-center w-full my-auto">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-widest block mb-6">
                      ANSWER
                    </span>
                    <div className="text-lg md:text-2xl leading-relaxed whitespace-pre-wrap dark:text-white">
                      {currentCard.back_text}
                    </div>
                    <CardMedia media={currentCard.media} side="back" />
                    {currentCard.deck_name && (
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-6">
                        {currentCard.deck_name}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Rating Buttons */}
      <div
        className="h-32 p-4 flex items-center justify-center w-full max-w-2xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <AnimatePresence>
          {isFlipped ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-4 gap-2 md:gap-4 w-full"
            >
              {RATINGS.map((r, i) => (
                <button
                  key={r}
                  onClick={() => handleRating(r)}
                  className="h-16 flex flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-semibold capitalize transition-all hover:scale-105 active:scale-95"
                  style={{ borderColor: RATING_STYLES[r].bg + '40', color: RATING_STYLES[r].bg }}
                >
                  <span>{r}</span>
                  <span className="text-[10px] text-gray-400 dark:text-slate-500">{i + 1}</span>
                </button>
              ))}
            </motion.div>
          ) : (
            <div className="w-full text-center text-sm text-gray-400 dark:text-slate-500">
              Focus mode active. Distractions minimized.
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
