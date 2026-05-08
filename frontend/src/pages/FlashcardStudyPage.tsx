import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGetDueCards, useSubmitReview } from "@/hooks/use-flashcard-api";
import { useLanguage } from "@/i18n/useLanguage";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/primitives";
import { X, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Rating = "again" | "hard" | "good" | "easy";

export default function FlashcardStudyPage() {
  const params = useParams();
  const deckId = params?.deckId || "";
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const isVi = lang === "vi";

  const { data: dueCards, isLoading } = useGetDueCards(deckId);

  const submitReviewMut = useSubmitReview();

  const [queue, setQueue] = useState<any[]>([]);
  const [initialTotal, setInitialTotal] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [bgTint, setBgTint] = useState<string>("transparent");

  useEffect(() => {
    if (dueCards && dueCards.length > 0 && queue.length === 0 && initialTotal === 0) {
      setQueue(dueCards);
      setInitialTotal(dueCards.length);
    }
  }, [dueCards, queue.length, initialTotal]);

  const currentCard = queue[0];
  const progress = initialTotal > 0 ? ((initialTotal - queue.length) / initialTotal) * 100 : 0;

  const handleFlip = useCallback(() => {
    if (!isFlipped && queue.length > 0) {
      setIsFlipped(true);
    }
  }, [isFlipped, queue.length]);

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
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;

      if (e.code === "Space") {
        e.preventDefault();
        handleFlip();
      } else if (isFlipped) {
        if (e.key === "1") handleRating("again");
        if (e.key === "2") handleRating("hard");
        if (e.key === "3") handleRating("good");
        if (e.key === "4") handleRating("easy");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFlip, handleRating, isFlipped]);

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
            <Button variant="outline" onClick={() => navigate("/flashcards/decks")}>
              {isVi ? "Quay lại bộ thẻ" : "Back to Decks"}
            </Button>
            <Button onClick={() => navigate("/dashboard")}>{isVi ? "Về trang chính" : "Go to Dashboard"}</Button>
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
          <Button onClick={() => navigate("/flashcards/decks")}>{isVi ? "Quay lại bộ thẻ" : "Back to Decks"}</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background transition-colors duration-300"
      style={{ backgroundColor: bgTint !== "transparent" ? bgTint : "" }}
    >
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
        <div className="flex-1 max-w-sm mx-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-2 font-medium">
            <span>
              {initialTotal - queue.length} / {initialTotal}
            </span>
            <span>{queue.length} {isVi ? "thẻ còn lại" : "remaining"}</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
        <div className="w-10" />
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
              className="w-full max-w-2xl aspect-[4/3] max-h-[60vh] relative cursor-pointer"
              onClick={handleFlip}
            >
              <motion.div
                className="w-full h-full relative"
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* Front Face */}
                <div
                  className="absolute inset-0 w-full h-full bg-card border rounded-2xl shadow-xl flex items-center justify-center p-8 md:p-12"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <div className="text-center">
                    <span className="text-xs font-bold text-muted-foreground tracking-widest block mb-6">
                      {isVi ? "CÂU HỎI" : "QUESTION"}
                    </span>
                    <div className="text-xl md:text-3xl font-medium leading-relaxed whitespace-pre-wrap">
                      {currentCard.front_text}
                    </div>
                  </div>
                  {!isFlipped && (
                    <div className="absolute bottom-6 left-0 right-0 text-center text-sm text-muted-foreground animate-pulse">
                      {isVi ? "Chạm hoặc nhấn phím Cách (Space) để lật" : "Tap or press Space to reveal"}
                    </div>
                  )}
                </div>

                {/* Back Face */}
                <div
                  className="absolute inset-0 w-full h-full bg-card border border-primary/20 rounded-2xl shadow-xl flex items-center justify-center p-8 md:p-12 overflow-y-auto"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <div className="text-center w-full my-auto">
                    <span className="text-xs font-bold text-primary tracking-widest block mb-6">
                      {isVi ? "ĐÁP ÁN" : "ANSWER"}
                    </span>
                    <div className="text-lg md:text-2xl leading-relaxed whitespace-pre-wrap">
                      {currentCard.back_text}
                    </div>
                    {currentCard.deck_name && (
                      <p className="text-xs text-muted-foreground mt-6">{currentCard.deck_name}</p>
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
        className="h-32 p-4 flex items-center justify-center w-full max-w-2xl mx-auto"
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
                className="h-16 flex flex-col gap-1 border-red-500/30 hover:bg-red-500/10 hover:text-red-500"
                onClick={() => handleRating("again")}
              >
                <span className="font-semibold text-red-500">{isVi ? "Lại" : "Again"}</span>
                <span className="text-[10px] text-muted-foreground hidden md:inline">1</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1 border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-500"
                onClick={() => handleRating("hard")}
              >
                <span className="font-semibold text-orange-500">{isVi ? "Khó" : "Hard"}</span>
                <span className="text-[10px] text-muted-foreground hidden md:inline">2</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1 border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-500"
                onClick={() => handleRating("good")}
              >
                <span className="font-semibold text-blue-500">{isVi ? "Tốt" : "Good"}</span>
                <span className="text-[10px] text-muted-foreground hidden md:inline">3</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1 border-green-500/30 hover:bg-green-500/10 hover:text-green-500"
                onClick={() => handleRating("easy")}
              >
                <span className="font-semibold text-green-500">{isVi ? "Dễ" : "Easy"}</span>
                <span className="text-[10px] text-muted-foreground hidden md:inline">4</span>
              </Button>
            </motion.div>
          ) : (
            <div className="w-full text-center text-sm text-muted-foreground">
              {isVi ? "Chế độ tập trung đang bật. Đã ẩn các công cụ làm phiền." : "Focus mode active. Distractions minimized."}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
