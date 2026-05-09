import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useListCards, useSubmitReview, type Card } from '@/hooks/use-flashcard-api';
import { useLanguage } from '@/i18n/useLanguage';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/primitives';
import {
  X,
  CheckCircle2,
  Volume2,
  VolumeX,
  Star,
  Zap,
  ZapOff,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ShortcutsModal, { useShortcutsToggle } from '@/components/ui/ShortcutsModal';
import { toast } from 'sonner';

type Rating = 'again' | 'hard' | 'good' | 'easy';

export default function FlashcardStudyPage() {
  const params = useParams();
  const deckId = params?.deckId || '';
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const isVi = lang === 'vi';
  const { open: shortcutsOpen, setOpen: setShortcutsOpen } = useShortcutsToggle();

  const sanitizeMediaUrl = (url: string | null) => {
    if (!url) return '';
    return url.replace('http://minio:9000', '');
  };

  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const { data: allCards, isLoading } = useListCards(deckId);

  const submitReviewMut = useSubmitReview();

  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // 1 for next, -1 for back
  const [reviewedCardIds, setReviewedCardIds] = useState<Set<string>>(new Set());
  const [initialTotal, setInitialTotal] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [bgTint, setBgTint] = useState<string>('transparent');
  const [autoPlay, setAutoPlay] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('flashcard_autoplay');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [autoNext, setAutoNext] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('flashcard_autonext');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });
  const [history, setHistory] = useState<Card[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoNextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentCard = cards[currentIndex];
  const progress = initialTotal > 0 ? ((currentIndex + 1) / initialTotal) * 100 : 0;

  const playAudio = useCallback(
    (input: 'front' | 'back' | string) => {
      let urlToPlay = '';
      if (input === 'front' || input === 'back') {
        if (!currentCard?.media) return;
        const media = currentCard.media.find((m) => m.media_type === 'audio' && m.side === input);
        if (media?.public_url) {
          urlToPlay = sanitizeMediaUrl(media.public_url);
        }
      } else {
        urlToPlay = input;
      }

      if (urlToPlay && audioRef.current) {
        // Reset and play
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = urlToPlay;
        audioRef.current.load();
        audioRef.current.play().catch((e) => {
          if (e.name === 'AbortError') return;
          console.warn('Audio playback failed', e);
        });
      }
    },
    [currentCard],
  );

  useEffect(() => {
    if (allCards && allCards.length > 0 && cards.length === 0 && initialTotal === 0) {
      setCards(allCards);
      setInitialTotal(allCards.length);
    }
  }, [allCards, cards.length, initialTotal]);

  useEffect(() => {
    localStorage.setItem('flashcard_autoplay', JSON.stringify(autoPlay));
  }, [autoPlay]);

  useEffect(() => {
    localStorage.setItem('flashcard_autonext', JSON.stringify(autoNext));
    if (!autoNext && autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
    }
  }, [autoNext]);

  const handleFlip = useCallback(() => {
    if (cards.length > 0) {
      setIsFlipped((prev) => !prev);
    }
  }, [cards.length]);

  const handleNext = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setDirection(1);
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      if (autoNextTimerRef.current) {
        clearTimeout(autoNextTimerRef.current);
      }
    }
  }, [currentIndex, cards.length]);

  const handleBack = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
      if (autoNextTimerRef.current) {
        clearTimeout(autoNextTimerRef.current);
      }
    }
  }, [currentIndex]);

  const handleRating = useCallback(
    (rating: Rating) => {
      if (!currentCard || !isFlipped) return;

      if (autoNextTimerRef.current) {
        clearTimeout(autoNextTimerRef.current);
      }

      // Haptic feedback
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }

      // Visual background feedback
      if (rating === 'again') setBgTint('rgba(239, 68, 68, 0.05)');
      else if (rating === 'easy') setBgTint('rgba(34, 197, 94, 0.05)');
      else if (rating === 'good') setBgTint('rgba(59, 130, 246, 0.05)');
      else if (rating === 'hard') setBgTint('rgba(245, 158, 11, 0.05)');

      setTimeout(() => setBgTint('transparent'), 500);

      // Mark as reviewed
      setReviewedCardIds((prev) => new Set(prev).add(currentCard.id));

      // API call in background
      submitReviewMut.mutate({ cardId: currentCard.id, rating });

      // Move to next card if available
      if (currentIndex < cards.length - 1) {
        handleNext();
      } else {
        // If last card, we might want to stay or show finished
        // For simplicity, let's just toast
        toast.success(isVi ? 'Đã hoàn thành thẻ cuối!' : 'Final card reviewed!');
      }
    },
    [currentCard, isFlipped, submitReviewMut, currentIndex, cards.length, handleNext, isVi],
  );

  const handleNextManual = useCallback(() => {
    handleNext();
  }, [handleNext]);

  // Handle audio end for auto-next
  const onAudioEnded = useCallback(() => {
    if (!autoNext) return;

    if (!isFlipped) {
      // Front finished -> auto flip after more gap
      autoNextTimerRef.current = setTimeout(() => {
        handleFlip();
      }, 2500);
    } else {
      // Back finished -> auto next after longer gap
      autoNextTimerRef.current = setTimeout(() => {
        if (currentIndex < cards.length - 1) {
          handleNext();
        }
      }, 3500);
    }
  }, [autoNext, isFlipped, handleFlip, handleNext, currentIndex, cards.length]);

  // Master Auto-play trigger & Auto-next fallback
  useEffect(() => {
    if (!currentCard) return;

    if (autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
    }

    const hasAudio = !isFlipped
      ? currentCard.media?.some((m) => m.side === 'front' && m.media_type === 'audio')
      : currentCard.media?.some((m) => m.side === 'back' && m.media_type === 'audio');

    if (!isFlipped) {
      // FRONT SIDE
      if (autoPlay) {
        const timer = setTimeout(() => playAudio('front'), 400);

        // If NO audio on front, and autoNext is ON -> fallback timer
        if (!hasAudio && autoNext) {
          autoNextTimerRef.current = setTimeout(() => handleFlip(), 4500);
        }
        return () => clearTimeout(timer);
      } else if (autoNext) {
        // If autoNext is ON but autoPlay is OFF -> fallback timer
        autoNextTimerRef.current = setTimeout(() => handleFlip(), 5000);
      }
    } else {
      // BACK SIDE
      if (autoPlay) {
        playAudio('back');

        // If NO audio on back, and autoNext is ON -> fallback timer to next card
        if (!hasAudio && autoNext && currentIndex < cards.length - 1) {
          autoNextTimerRef.current = setTimeout(() => handleNext(), 5000);
        }
      } else if (autoNext && currentIndex < cards.length - 1) {
        // If autoNext is ON but autoPlay is OFF -> fallback timer
        autoNextTimerRef.current = setTimeout(() => handleNext(), 6000);
      }
    }
  }, [
    currentCard?.id,
    isFlipped,
    autoPlay,
    autoNext,
    playAudio,
    handleFlip,
    handleNext,
    currentIndex,
    cards.length,
  ]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (zoomedImage) {
        if (e.key === 'Escape') setZoomedImage(null);
        return;
      }

      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        shortcutsOpen
      )
        return;

      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = e.key.toLowerCase();
      if (key === 'f') {
        e.preventDefault();
        handleFlip();
      } else if (isFlipped) {
        if (e.key === '1') handleRating('again');
        if (e.key === '2') handleRating('hard');
        if (e.key === '3') handleRating('good');
        if (e.key === '4') handleRating('easy');
      }

      // 'R' to replay audio
      if (key === 'r') {
        playAudio(isFlipped ? 'back' : 'front');
      }

      // 'A' to toggle auto-play
      if (key === 'a') {
        e.preventDefault();
        setAutoPlay((prev) => {
          const next = !prev;
          toast.info(
            isVi
              ? `Tự động phát: ${next ? 'BẬT' : 'TẮT'}`
              : `Auto-play: ${next ? 'ENABLED' : 'DISABLED'}`,
            { duration: 1500 },
          );
          return next;
        });
      }

      // 'Z' to toggle auto-next
      if (key === 'z') {
        e.preventDefault();
        setAutoNext((prev) => {
          const next = !prev;
          toast.info(
            isVi
              ? `Tự động chuyển: ${next ? 'BẬT' : 'TẮT'}`
              : `Auto-advance: ${next ? 'ENABLED' : 'DISABLED'}`,
            { duration: 1500, icon: <Zap className="w-4 h-4 text-yellow-500" /> },
          );
          return next;
        });
      }

      // Arrow keys for manual navigation
      if (e.key === 'ArrowLeft') {
        handleBack();
      }
      if (e.key === 'ArrowRight') {
        handleNextManual();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleFlip,
    handleRating,
    handleBack,
    handleNextManual,
    isFlipped,
    playAudio,
    shortcutsOpen,
    zoomedImage,
  ]);

  // Touch swipe handling
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart || !isFlipped) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;

    if (diff > 50)
      handleRating('again'); // swipe left
    else if (diff < -50) handleRating('good'); // swipe right
    setTouchStart(null);
  };

  if (isLoading && initialTotal === 0) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        {isVi ? 'Đang tải phiên học...' : 'Loading session...'}
      </div>
    );
  }

  // Session complete
  if (reviewedCardIds.size === initialTotal && initialTotal > 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md text-center space-y-6"
        >
          <div className="mx-auto w-24 h-24 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              {isVi ? 'Hoàn thành bài ôn' : 'Session Complete'}
            </h2>
            <p className="text-muted-foreground mt-2">
              {isVi
                ? `Bạn đã ôn xong toàn bộ ${initialTotal} thẻ hôm nay cho bộ này.`
                : `You've reviewed all ${initialTotal} cards due for this deck.`}
            </p>
          </div>
          <div className="pt-4 flex gap-4 justify-center">
            <Button
              variant="outline"
              className="transition-all hover:scale-105 active:scale-95"
              onClick={() => navigate('/flashcards/decks')}
            >
              {isVi ? 'Quay lại bộ thẻ' : 'Back to Decks'}
            </Button>
            <Button
              className="transition-all hover:scale-105 active:scale-95"
              onClick={() => navigate('/dashboard')}
            >
              {isVi ? 'Về trang chính' : 'Go to Dashboard'}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // No cards due
  if (initialTotal === 0 && !isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-6">
          <CheckCircle2 className="w-16 h-16 mx-auto text-muted-foreground opacity-50" />
          <div>
            <h2 className="text-2xl font-semibold">
              {isVi ? 'Không có thẻ cần ôn' : 'No Cards Due'}
            </h2>
            <p className="text-muted-foreground mt-2">
              {isVi
                ? 'Bạn đã hoàn thành xong bộ thẻ này hôm nay.'
                : "You're all caught up with this deck."}
            </p>
          </div>
          <Button
            className="transition-all hover:scale-105 active:scale-95"
            onClick={() => navigate('/flashcards/decks')}
          >
            {isVi ? 'Quay lại bộ thẻ' : 'Back to Decks'}
          </Button>
        </div>
      </div>
    );
  }
  const frontImage = currentCard?.media?.find(
    (m) => m.side === 'front' && m.media_type === 'image',
  );
  const backImage = currentCard?.media?.find((m) => m.side === 'back' && m.media_type === 'image');
  const frontAudio =
    currentCard?.media?.filter((m) => m.side === 'front' && m.media_type === 'audio') || [];
  const backAudio =
    currentCard?.media?.filter((m) => m.side === 'back' && m.media_type === 'audio') || [];

  const hasFrontText = !!(currentCard?.front_text && currentCard.front_text.trim());
  const hasFrontImage = !!frontImage;
  const hasBackText = !!(currentCard?.back_text && currentCard.back_text.trim());
  const hasBackImage = !!backImage;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background transition-colors duration-300"
      style={{ backgroundColor: bgTint !== 'transparent' ? bgTint : '' }}
    >
      <audio ref={audioRef} className="hidden" onEnded={onAudioEnded} />

      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 bg-transparent">
        <div className="w-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/flashcards/decks/${deckId}/cards`)}
            className="rounded-full text-muted-foreground hover:bg-muted/20"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex-1 max-sm:mx-4 mx-8">
          <div className="flex justify-between text-xs text-muted-foreground mb-2 font-medium">
            <span>
              {currentIndex + 1} / {initialTotal}
            </span>
            <span>
              {reviewedCardIds.has(currentCard?.id) ? (
                <span className="text-green-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {isVi ? 'Đã ôn' : 'Reviewed'}
                </span>
              ) : (
                <span>
                  {initialTotal - reviewedCardIds.size} {isVi ? 'thẻ chưa ôn' : 'remaining'}
                </span>
              )}
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setAutoPlay(!autoPlay);
              toast.info(
                isVi
                  ? `Tự động phát: ${!autoPlay ? 'BẬT' : 'TẮT'}`
                  : `Auto-play: ${!autoPlay ? 'ENABLED' : 'DISABLED'}`,
                { duration: 1500 },
              );
            }}
            className={`rounded-full transition-all duration-300 ${autoPlay
                ? 'text-primary bg-primary/10 hover:bg-primary/20'
                : 'text-muted-foreground hover:bg-muted/20'
              }`}
            title={
              isVi
                ? autoPlay
                  ? 'Tắt tự động phát (Phím A)'
                  : 'Bật tự động phát (Phím A)'
                : autoPlay
                  ? 'Turn off auto-play (Key A)'
                  : 'Turn on auto-play (Key A)'
            }
          >
            {autoPlay ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setAutoNext(!autoNext);
              toast.info(
                isVi
                  ? `Tự động chuyển: ${!autoNext ? 'BẬT' : 'TẮT'}`
                  : `Auto-advance: ${!autoNext ? 'ENABLED' : 'DISABLED'}`,
                { duration: 1500, icon: <Zap className="w-4 h-4 text-yellow-500" /> },
              );
            }}
            className={`rounded-full transition-all duration-300 ${autoNext
                ? 'text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20'
                : 'text-muted-foreground hover:bg-muted/20'
              }`}
            title={
              isVi
                ? autoNext
                  ? 'Tắt tự động chuyển (Phím Z)'
                  : 'Bật tự động chuyển (Phím Z)'
                : autoNext
                  ? 'Turn off auto-advance (Key Z)'
                  : 'Turn on auto-advance (Key Z)'
            }
          >
            {autoNext ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Auto-next Status Indicator */}
      <AnimatePresence>
        {autoNext && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex justify-center -mt-2"
          >
            <div className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-medium border border-yellow-500/20">
              <Zap className="w-3 h-3 fill-current" />
              {isVi ? 'CHẾ ĐỘ TỰ ĐỘNG ĐANG BẬT' : 'AUTO-ADVANCE ACTIVE'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card Area */}
      <div
        className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden relative"
        style={{ perspective: '1000px' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="popLayout" custom={direction}>
          {currentCard && (
            <motion.div
              key={currentCard.id}
              custom={direction}
              initial={{ x: direction > 0 ? '100%' : direction < 0 ? '-100%' : 0, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction > 0 ? '-100%' : direction < 0 ? '100%' : 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-4xl min-h-100 h-[70vh] relative cursor-pointer"
              onClick={handleFlip}
            >
              <motion.div
                className="w-full h-full relative will-change-transform motion-safe:transform motion-reduce:transform-none motion-reduce:transition-none"
                animate={{ rotateX: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Front Face */}
                <div
                  className="absolute inset-0 w-full h-full bg-white dark:bg-[#1A1A1A] border border-transparent dark:border-white/10 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none flex flex-col justify-between p-8"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <div className="relative mb-4 shrink-0 w-full flex justify-center items-center min-h-8">
                    <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold absolute left-1/2 -translate-x-1/2">
                      {isVi ? 'CÂU HỎI' : 'QUESTION'}
                    </span>
                    <div className="absolute right-0 flex items-center gap-2">
                      {frontAudio.map((m) => (
                        <Button
                          key={m.id}
                          variant="ghost"
                          size="icon"
                          className="rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-white/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            playAudio(sanitizeMediaUrl(m.public_url));
                          }}
                        >
                          <Volume2 className="h-5 w-5" />
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-slate-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-500/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Toggle star logic placeholder
                        }}
                      >
                        <Star className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 w-full flex items-center justify-center overflow-hidden">
                    {hasFrontText && hasFrontImage ? (
                      <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center px-4">
                        <div className="flex items-center justify-center h-full w-full">
                          <div className="text-3xl md:text-4xl font-semibold text-slate-800 dark:text-slate-200 text-center wrap-break-word">
                            {currentCard.front_text}
                          </div>
                        </div>
                        <div className="flex items-center justify-center h-full w-full">
                          <div
                            className="w-full h-48 md:h-64 bg-slate-50 dark:bg-black/20 rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 p-4 cursor-zoom-in group/img relative shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedImage(sanitizeMediaUrl(frontImage.public_url));
                            }}
                          >
                            <img
                              src={sanitizeMediaUrl(frontImage.public_url)}
                              alt=""
                              className="w-full h-full object-contain transition-transform duration-300 group-hover/img:scale-105"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center w-full h-full text-center px-4 gap-6">
                        {hasFrontText && (
                          <div className="text-4xl md:text-5xl font-semibold text-slate-800 dark:text-slate-200 whitespace-pre-wrap wrap-break-word">
                            {currentCard.front_text}
                          </div>
                        )}
                        {hasFrontImage && (
                          <div
                            className="w-full max-w-sm md:max-w-md h-48 md:h-64 bg-slate-50 dark:bg-black/20 rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 p-4 cursor-zoom-in group/img relative shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedImage(sanitizeMediaUrl(frontImage.public_url));
                            }}
                          >
                            <img
                              src={sanitizeMediaUrl(frontImage.public_url)}
                              alt=""
                              className="w-full h-full object-contain transition-transform duration-300 group-hover/img:scale-105"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Back Face */}
                <div
                  className="absolute inset-0 w-full h-full bg-white dark:bg-[#1A1A1A] border border-transparent dark:border-white/10 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none flex flex-col justify-between p-8"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}
                >
                  <div className="relative mb-4 shrink-0 w-full flex justify-center items-center min-h-8">
                    <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold absolute left-1/2 -translate-x-1/2">
                      {isVi ? 'ĐÁP ÁN' : 'ANSWER'}
                    </span>
                    <div className="absolute right-0 flex items-center gap-2">
                      {backAudio.map((m) => (
                        <Button
                          key={m.id}
                          variant="ghost"
                          size="icon"
                          className="rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-white/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            playAudio(sanitizeMediaUrl(m.public_url));
                          }}
                        >
                          <Volume2 className="h-5 w-5" />
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-slate-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-500/10"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <Star className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 w-full flex items-center justify-center overflow-hidden">
                    {hasBackText && hasBackImage ? (
                      <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center px-4">
                        <div className="flex items-center justify-center h-full w-full">
                          <div className="text-2xl md:text-3xl font-medium text-slate-700 dark:text-slate-300 text-center wrap-break-word">
                            {currentCard.back_text}
                          </div>
                        </div>
                        <div className="flex items-center justify-center h-full w-full">
                          <div
                            className="w-full h-48 md:h-64 bg-slate-50 dark:bg-black/20 rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 p-4 cursor-zoom-in group/img relative shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedImage(sanitizeMediaUrl(backImage.public_url));
                            }}
                          >
                            <img
                              src={sanitizeMediaUrl(backImage.public_url)}
                              alt=""
                              className="w-full h-full object-contain transition-transform duration-300 group-hover/img:scale-105"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center w-full h-full text-center px-4 gap-6">
                        {hasBackText && (
                          <div className="text-3xl md:text-4xl font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap wrap-break-word">
                            {currentCard.back_text}
                          </div>
                        )}
                        {hasBackImage && (
                          <div
                            className="w-full max-w-sm md:max-w-md h-48 md:h-64 bg-slate-50 dark:bg-black/20 rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 p-4 cursor-zoom-in group/img relative shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedImage(sanitizeMediaUrl(backImage.public_url));
                            }}
                          >
                            <img
                              src={sanitizeMediaUrl(backImage.public_url)}
                              alt=""
                              className="w-full h-full object-contain transition-transform duration-300 group-hover/img:scale-105"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 text-center shrink-0 h-7 flex flex-col justify-end">
                    {currentCard.deck_name && (
                      <p className="text-[10px] text-muted-foreground opacity-50 uppercase tracking-tighter">
                        {currentCard.deck_name}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Side Navigation Buttons (Desktop) */}
        <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40 hidden lg:block">
          <Button
            variant="outline"
            size="icon"
            disabled={currentIndex === 0}
            onClick={handleBack}
            className="h-14 w-14 rounded-full bg-background/80 backdrop-blur-md border shadow-lg hover:bg-primary/5 hover:text-primary transition-all active:scale-95 disabled:opacity-30"
          >
            <ChevronLeft className="w-8 h-8" />
          </Button>
        </div>

        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 hidden lg:block">
          <Button
            variant="outline"
            size="icon"
            disabled={currentIndex === cards.length - 1}
            onClick={handleNextManual}
            className="h-14 w-14 rounded-full bg-background/80 backdrop-blur-md border shadow-lg hover:bg-primary/5 hover:text-primary transition-all active:scale-95 disabled:opacity-30"
          >
            <ChevronRight className="w-8 h-8" />
          </Button>
        </div>
      </div>

      {/* Controls Area */}
      <div
        className="min-h-32 p-4 flex items-center justify-center w-full max-w-5xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <AnimatePresence>
          {isFlipped && !reviewedCardIds.has(currentCard.id) ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-4 gap-2 md:gap-4 w-full"
            >
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1 border-red-500/30 hover:bg-red-500/10 hover:text-red-500 transition-all hover:scale-105 active:scale-95"
                onClick={() => handleRating('again')}
              >
                <span className="font-semibold text-red-500">{isVi ? 'Lại' : 'Again'}</span>
                <span className="text-[10px] text-muted-foreground hidden md:inline">1</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1 border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-500 transition-all hover:scale-105 active:scale-95"
                onClick={() => handleRating('hard')}
              >
                <span className="font-semibold text-orange-500">{isVi ? 'Khó' : 'Hard'}</span>
                <span className="text-[10px] text-muted-foreground hidden md:inline">2</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1 border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-500 transition-all hover:scale-105 active:scale-95"
                onClick={() => handleRating('good')}
              >
                <span className="font-semibold text-blue-500">{isVi ? 'Tốt' : 'Good'}</span>
                <span className="text-[10px] text-muted-foreground hidden md:inline">3</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1 border-green-500/30 hover:bg-green-500/10 hover:text-green-500 transition-all hover:scale-105 active:scale-95"
                onClick={() => handleRating('easy')}
              >
                <span className="font-semibold text-green-500">{isVi ? 'Dễ' : 'Easy'}</span>
                <span className="text-[10px] text-muted-foreground hidden md:inline">4</span>
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Image Lightbox / Zoom Overlay */}
      <AnimatePresence>
        {zoomedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-12 cursor-zoom-out"
            onClick={() => setZoomedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative max-w-7xl max-h-full w-full h-full flex items-center justify-center cursor-zoom-out"
            >
              <img
                src={zoomedImage}
                alt="Zoomed View"
                className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-0 right-0 m-2 md:-top-10 md:-right-10 text-white hover:bg-white/20 rounded-full"
                onClick={() => setZoomedImage(null)}
              >
                <X className="w-8 h-8" />
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
