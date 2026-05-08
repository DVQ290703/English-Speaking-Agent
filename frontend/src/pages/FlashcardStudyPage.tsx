import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGetDueCards, useSubmitReview } from "@/hooks/use-flashcard-api";
import { useLanguage } from "@/i18n/useLanguage";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/primitives";
import { X, CheckCircle2, Volume2, Play, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ShortcutsModal, { useShortcutsToggle } from "@/components/ui/ShortcutsModal";
import { HelpCircle } from "lucide-react";

type Rating = "again" | "hard" | "good" | "easy";

export default function FlashcardStudyPage() {
  const params = useParams();
  const deckId = params?.deckId || "";
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const isVi = lang === "vi";
  const { open: shortcutsOpen, setOpen: setShortcutsOpen } = useShortcutsToggle();

  const sanitizeMediaUrl = (url: string | null) => {
    if (!url) return "";
    return url.replace('http://minio:9000', '');
  };

  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const { data: dueCards, isLoading } = useGetDueCards(deckId);

  const submitReviewMut = useSubmitReview();

  const [queue, setQueue] = useState<any[]>([]);
  const [initialTotal, setInitialTotal] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [bgTint, setBgTint] = useState<string>("transparent");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (dueCards && dueCards.length > 0 && queue.length === 0 && initialTotal === 0) {
      setQueue(dueCards);
      setInitialTotal(dueCards.length);
    }
  }, [dueCards, queue.length, initialTotal]);

  const currentCard = queue[0];
  const progress = initialTotal > 0 ? ((initialTotal - queue.length) / initialTotal) * 100 : 0;

  const playAudio = useCallback((input: "front" | "back" | string) => {
    let urlToPlay = "";
    if (input === "front" || input === "back") {
      if (!currentCard?.media) return;
      const media = currentCard.media.find((m: any) => m.media_type === "audio" && m.side === input);
      if (media?.public_url) {
        urlToPlay = sanitizeMediaUrl(media.public_url);
      }
    } else {
      urlToPlay = input;
    }

    if (urlToPlay && audioRef.current) {
      audioRef.current.src = urlToPlay;
      audioRef.current.play().catch(e => console.warn("Audio playback failed", e));
    }
  }, [currentCard]);


  const handleFlip = useCallback(() => {
    if (queue.length > 0) {
      setIsFlipped(prev => !prev);
    }
  }, [queue.length]);

  const handleRating = useCallback(
    (rating: Rating) => {
      if (!currentCard || !isFlipped) return;

      // Haptic feedback
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(15);
      }

      // Visual background feedback
      if (rating === "again") setBgTint("rgba(239, 68, 68, 0.05)");
      else if (rating === "easy") setBgTint("rgba(34, 197, 94, 0.05)");
      else if (rating === "good") setBgTint("rgba(59, 130, 246, 0.05)");
      else if (rating === "hard") setBgTint("rgba(245, 158, 11, 0.05)");

      setTimeout(() => setBgTint("transparent"), 500);

      // Optimistic update — move to next card immediately
      setQueue((prev) => prev.slice(1));
      setIsFlipped(false);

      // API call in background
      submitReviewMut.mutate({ cardId: currentCard.id, rating });
    },
    [currentCard, isFlipped, submitReviewMut],
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (zoomedImage) {
        if (e.key === "Escape") setZoomedImage(null);
        return;
      }

      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        shortcutsOpen
      )
        return;

      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = e.key.toLowerCase();
      if (key === "f") {
        e.preventDefault();
        handleFlip();
      } else if (isFlipped) {
        if (e.key === "1") handleRating("again");
        if (e.key === "2") handleRating("hard");
        if (e.key === "3") handleRating("good");
        if (e.key === "4") handleRating("easy");
      }

      // 'R' to replay audio
      if (e.key.toLowerCase() === "r") {
        playAudio(isFlipped ? "back" : "front");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFlip, handleRating, isFlipped, playAudio, shortcutsOpen]);

  // Touch swipe handling
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart || !isFlipped) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;

    if (diff > 50) handleRating("again"); // swipe left
    else if (diff < -50) handleRating("good"); // swipe right
    setTouchStart(null);
  };

  if (isLoading && initialTotal === 0) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        {isVi ? "Đang tải phiên học..." : "Loading session..."}
      </div>
    );
  }

  // Session complete
  if (queue.length === 0 && initialTotal > 0) {
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
            <h2 className="text-3xl font-bold tracking-tight">{isVi ? "Hoàn thành bài ôn" : "Session Complete"}</h2>
            <p className="text-muted-foreground mt-2">
              {isVi ? `Bạn đã ôn xong toàn bộ ${initialTotal} thẻ hôm nay cho bộ này.` : `You've reviewed all ${initialTotal} cards due for this deck.`}
            </p>
          </div>
          <div className="pt-4 flex gap-4 justify-center">
            <Button variant="outline" className="transition-all hover:scale-105 active:scale-95" onClick={() => navigate("/flashcards/decks")}>
              {isVi ? "Quay lại bộ thẻ" : "Back to Decks"}
            </Button>
            <Button className="transition-all hover:scale-105 active:scale-95" onClick={() => navigate("/dashboard")}>{isVi ? "Về trang chính" : "Go to Dashboard"}</Button>
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
            <h2 className="text-2xl font-semibold">{isVi ? "Không có thẻ cần ôn" : "No Cards Due"}</h2>
            <p className="text-muted-foreground mt-2">{isVi ? "Bạn đã hoàn thành xong bộ thẻ này hôm nay." : "You're all caught up with this deck."}</p>
          </div>
          <Button className="transition-all hover:scale-105 active:scale-95" onClick={() => navigate("/flashcards/decks")}>{isVi ? "Quay lại bộ thẻ" : "Back to Decks"}</Button>
        </div>
      </div>
    );
  }
  const frontImage = currentCard?.media?.find((m: any) => m.side === "front" && m.media_type === "image");
  const backImage = currentCard?.media?.find((m: any) => m.side === "back" && m.media_type === "image");
  const frontAudio = currentCard?.media?.filter((m: any) => m.side === "front" && m.media_type === "audio") || [];
  const backAudio = currentCard?.media?.filter((m: any) => m.side === "back" && m.media_type === "audio") || [];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background transition-colors duration-300"
      style={{ backgroundColor: bgTint !== "transparent" ? bgTint : "" }}
    >
      <audio ref={audioRef} className="hidden" />

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
              {initialTotal - queue.length} / {initialTotal}
            </span>
            <span>{queue.length} {isVi ? "thẻ còn lại" : "remaining"}</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
        <div className="w-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShortcutsOpen(true)}
            className="rounded-full text-muted-foreground hover:bg-muted/20"
            title={isVi ? "Phím tắt" : "Keyboard shortcuts"}
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Card Area */}
      <div
        className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden"
        style={{ perspective: "1000px" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          {currentCard && (
            <motion.div
              key={currentCard.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-5xl min-h-[500px] h-[70vh] relative cursor-pointer"
              onClick={handleFlip}
            >
              <motion.div
                className="w-full h-full relative will-change-transform motion-safe:transform motion-reduce:transform-none motion-reduce:transition-none"
                animate={{ rotateX: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* Front Face */}
                <div
                  className="absolute inset-0 w-full h-full bg-white dark:bg-[#1A1A1A] border border-transparent dark:border-white/10 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none flex flex-col justify-between p-8"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <div className="relative mb-4 shrink-0 w-full flex justify-center items-center min-h-[32px]">
                    <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold absolute left-1/2 -translate-x-1/2">
                      {isVi ? "CÂU HỎI" : "QUESTION"}
                    </span>
                    <div className="absolute right-0 flex items-center gap-2">
                      {frontAudio.map((m: any) => (
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
                    {frontImage ? (
                      <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                        <div className="flex items-center justify-center h-full w-full">
                          <div className="text-3xl md:text-4xl font-semibold text-slate-800 dark:text-slate-200 text-center break-words">
                            {currentCard.front_text}
                          </div>
                        </div>
                        <div className="flex items-center justify-center h-full w-full">
                          <div 
                            className="w-full h-64 md:h-[450px] bg-slate-50 dark:bg-black/20 rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 p-4 cursor-zoom-in group/img relative"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedImage(sanitizeMediaUrl(frontImage.public_url));
                            }}
                          >
                            <img src={sanitizeMediaUrl(frontImage.public_url)} alt="" className="w-full h-full object-contain transition-transform duration-300 group-hover/img:scale-105" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-4xl md:text-5xl font-semibold text-slate-800 dark:text-slate-200 text-center whitespace-pre-wrap break-words">
                        {currentCard.front_text}
                      </div>
                    )}
                  </div>


                </div>

                {/* Back Face */}
                <div
                  className="absolute inset-0 w-full h-full bg-white dark:bg-[#1A1A1A] border border-transparent dark:border-white/10 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none flex flex-col justify-between p-8"
                  style={{ backfaceVisibility: "hidden", transform: "rotateX(180deg)" }}
                >
                  <div className="relative mb-4 shrink-0 w-full flex justify-center items-center min-h-[32px]">
                    <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold absolute left-1/2 -translate-x-1/2">
                      {isVi ? "ĐÁP ÁN" : "ANSWER"}
                    </span>
                    <div className="absolute right-0 flex items-center gap-2">
                      {backAudio.map((m: any) => (
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
                    {backImage ? (
                      <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                        <div className="flex items-center justify-center h-full w-full">
                          <div className="text-2xl md:text-3xl font-medium text-slate-700 dark:text-slate-300 text-center break-words">
                            {currentCard.back_text}
                          </div>
                        </div>
                        <div className="flex items-center justify-center h-full w-full">
                          <div 
                            className="w-full h-64 md:h-[450px] bg-slate-50 dark:bg-black/20 rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 p-4 cursor-zoom-in group/img relative"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedImage(sanitizeMediaUrl(backImage.public_url));
                            }}
                          >
                            <img src={sanitizeMediaUrl(backImage.public_url)} alt="" className="w-full h-full object-contain transition-transform duration-300 group-hover/img:scale-105" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-3xl md:text-4xl font-medium text-slate-700 dark:text-slate-300 text-center whitespace-pre-wrap break-words">
                        {currentCard.back_text}
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
      </div>

      {/* Controls Area */}
      <div
        className="min-h-[8rem] p-4 flex items-center justify-center w-full max-w-5xl mx-auto"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <AnimatePresence>
          {isFlipped ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-4 gap-2 md:gap-4 w-full"
            >
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1 border-red-500/30 hover:bg-red-500/10 hover:text-red-500 transition-all hover:scale-105 active:scale-95"
                onClick={() => handleRating("again")}
              >
                <span className="font-semibold text-red-500">{isVi ? "Lại" : "Again"}</span>
                <span className="text-[10px] text-muted-foreground hidden md:inline">1</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1 border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-500 transition-all hover:scale-105 active:scale-95"
                onClick={() => handleRating("hard")}
              >
                <span className="font-semibold text-orange-500">{isVi ? "Khó" : "Hard"}</span>
                <span className="text-[10px] text-muted-foreground hidden md:inline">2</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1 border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-500 transition-all hover:scale-105 active:scale-95"
                onClick={() => handleRating("good")}
              >
                <span className="font-semibold text-blue-500">{isVi ? "Tốt" : "Good"}</span>
                <span className="text-[10px] text-muted-foreground hidden md:inline">3</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1 border-green-500/30 hover:bg-green-500/10 hover:text-green-500 transition-all hover:scale-105 active:scale-95"
                onClick={() => handleRating("easy")}
              >
                <span className="font-semibold text-green-500">{isVi ? "Dễ" : "Easy"}</span>
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
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-12 cursor-zoom-out"
            onClick={() => setZoomedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
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
