import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useListCards,
  useCreateCard,
  useUpdateCard,
  useDeleteCard,
  useGetDeck,
  useUploadMedia,
  useDeleteMedia,
} from "@/hooks/use-flashcard-api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Label } from "@/components/ui/primitives";
import { Textarea } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n/useLanguage";
import { ArrowLeft, Plus, Search, MoreVertical, Edit, Trash, Play, Layers, Upload, Image, Volume2, X, AlertCircle, HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/primitives";

export default function FlashcardCardsPage() {
  const params = useParams();
  const deckId = params?.deckId || "";

  const { data: deck, isLoading: deckLoading } = useGetDeck(deckId);
  const { data: cards, isLoading: cardsLoading } = useListCards(deckId);
  const [search, setSearch] = useState("");
  const { lang } = useLanguage();
  const isVi = lang === "vi";

  const filteredCards = cards?.filter(
    (c: any) =>
      c.front_text.toLowerCase().includes(search.toLowerCase()) ||
      c.back_text.toLowerCase().includes(search.toLowerCase()) ||
      c.tags?.some((t: string) => t.toLowerCase().includes(search.toLowerCase())),
  );

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredCards?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140, // Estimated height for a card
    overscan: 5,
  });


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <Link to="/flashcards/decks">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          {deckLoading ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            <h1 className="text-2xl font-bold">{deck?.name}</h1>
          )}
        </div>
        <Link to={`/flashcards/decks/${deckId}/study`}>
          <Button className="gap-2 transition-all hover:scale-105 active:scale-95 shadow-md">
            <Play className="h-4 w-4" /> {isVi ? "Học bộ thẻ" : "Study Deck"}
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border rounded-lg p-4">
        <div className="flex-1 w-full relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder={isVi ? "Tìm thẻ hoặc từ khóa..." : "Search cards or tags..."}
            className="pl-8 bg-background max-w-md"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <CardFormDialog mode="create" deckId={deckId} isVi={isVi} />
      </div>

      {cardsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredCards && filteredCards.length > 0 ? (
        <div
          ref={parentRef}
          className="h-[calc(100vh-280px)] overflow-auto pr-2 custom-scrollbar rounded-lg"
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                  paddingBottom: "16px",
                }}
              >
                <FlashcardListItem
                  card={filteredCards[virtualItem.index]}
                  deckId={deckId}
                  isVi={isVi}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg border-dashed bg-card/50">
          <Layers className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{isVi ? "Không tìm thấy thẻ nào" : "No cards found"}</h3>
          <p className="text-muted-foreground max-w-sm mb-4">
            {search
              ? (isVi ? "Không có thẻ nào khớp với tìm kiếm của bạn." : "No cards match your search.")
              : (isVi ? "Bộ thẻ này đang trống. Hãy thêm thẻ để bắt đầu học." : "This deck is empty. Add some cards to start studying.")}
          </p>
          {!search && <CardFormDialog mode="create" deckId={deckId} isVi={isVi} />}
        </div>
      )}

      {/* Floating Action Button (FAB) Shortcut */}
      <div className="fixed bottom-8 right-8 z-50">
        <CardFormDialog
          mode="create"
          deckId={deckId}
          isVi={isVi}
          trigger={
            <Button
              size="icon"
              className="h-14 w-14 rounded-2xl shadow-2xl shadow-primary/20 hover:shadow-primary/40 transition-all duration-300 hover:scale-110 active:scale-95 group"
            >
              <Plus className="h-7 w-7 transition-transform group-hover:rotate-90 duration-300" />
            </Button>
          }
        />
      </div>
    </div>
  );
}

interface MediaFileItem {
  file: File;
  side: "front" | "back";
  media_type: "image" | "audio";
  preview?: string;
}

const MAX_FILE_SIZE_IMAGE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE_AUDIO = 10 * 1024 * 1024; // 10MB
const MAX_MEDIA_COUNT = 5;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3"];

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function sanitizeMediaUrl(url: string | null) {
  if (!url) return "";
  return url.replace('http://minio:9000', '');
}

function detectMediaType(file: File): "image" | "audio" | null {
  if (ALLOWED_IMAGE_TYPES.includes(file.type)) return "image";
  if (ALLOWED_AUDIO_TYPES.includes(file.type)) return "audio";
  return null;
}

const MEDIA_ICON_MAP = { image: Image, audio: Volume2 };

function CardFormDialog({
  mode,
  deckId,
  card,
  asDropdownItem = false,
  isVi = false,
  trigger,
}: {
  mode: "create" | "edit";
  deckId: string;
  card?: any;
  asDropdownItem?: boolean;
  isVi?: boolean;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [frontText, setFrontText] = useState(card?.front_text || "");
  const [backText, setBackText] = useState(card?.back_text || "");
  const [tags, setTags] = useState(card?.tags?.join(", ") || "");

  const [frontMedia, setFrontMedia] = useState<File[]>([]);
  const [backMedia, setBackMedia] = useState<File[]>([]);
  const [deletedMediaIds, setDeletedMediaIds] = useState<string[]>([]);

  const { toast } = useToast();
  const createMut = useCreateCard();
  const updateMut = useUpdateCard();
  const { mutateAsync: uploadCardMedia } = useUploadMedia();
  const { mutateAsync: deleteCardMedia } = useDeleteMedia();

  useEffect(() => {
    if (open) {
      setFrontText(card?.front_text || "");
      setBackText(card?.back_text || "");
      setTags(card?.tags?.join(", ") || "");
      setFrontMedia([]);
      setBackMedia([]);
      setDeletedMediaIds([]);
    }
  }, [open, card]);

  const validateAndAddFiles = (files: FileList | null, side: "front" | "back") => {
    if (!files) return;
    const newFiles = Array.from(files);
    const validFiles = newFiles.filter(file => {
      if (file.size > (file.type.startsWith('audio/') ? 10 : 5) * 1024 * 1024) {
        toast({ title: isVi ? "File quá lớn" : "File too large", variant: "destructive" });
        return false;
      }
      return true;
    });

    if (side === "front") {
      setFrontMedia(prev => [...prev, ...validFiles].slice(0, 5));
    } else {
      setBackMedia(prev => [...prev, ...validFiles].slice(0, 5));
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Smart validation: A side is valid if it has text OR pending media OR existing media
    const existingFrontMedia = card?.media?.filter((m: any) => m.side === "front" && !deletedMediaIds.includes(m.id)) || [];
    const existingBackMedia = card?.media?.filter((m: any) => m.side === "back" && !deletedMediaIds.includes(m.id)) || [];
    
    const hasFrontContent = frontText.trim() !== "" || frontMedia.length > 0 || existingFrontMedia.length > 0;
    const hasBackContent = backText.trim() !== "" || backMedia.length > 0 || existingBackMedia.length > 0;

    if (!hasFrontContent || !hasBackContent) {
      toast({
        title: isVi ? "Thiếu nội dung" : "Missing Content",
        description: isVi ? "Mỗi mặt của thẻ phải có ít nhất chữ hoặc một tệp media." : "Each side of the card must have text or media.",
        variant: "destructive",
      });
      return;
    }

    const cardData = {
      deckId,
      front_text: frontText,
      back_text: backText,
      tags: tags.split(",").map((t: string) => t.trim()).filter(Boolean),
    };

    try {
      const savedCard = await (mode === "create" ? createMut.mutateAsync(cardData) : updateMut.mutateAsync({ cardId: card.id, ...cardData }));
      const cardId = mode === "create" ? savedCard.id : card.id;

      for (const file of frontMedia) await uploadCardMedia({ cardId, deckId, side: "front", file, media_type: file.type.startsWith('audio/') ? 'audio' : 'image' });
      for (const file of backMedia) await uploadCardMedia({ cardId, deckId, side: "back", file, media_type: file.type.startsWith('audio/') ? 'audio' : 'image' });
      for (const mediaId of deletedMediaIds) await deleteCardMedia({ mediaId, deckId });

      setOpen(false);
      toast({ title: isVi ? "Đã lưu thành công" : "Saved successfully" });
    } catch (err) {
      toast({ title: isVi ? "Có lỗi xảy ra" : "An error occurred", variant: "destructive" });
    }
  };

  const TriggerButton = trigger ? (
    trigger
  ) : asDropdownItem ? (
    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
      <Edit className="mr-2 h-4 w-4" /> {isVi ? "Sửa thẻ" : "Edit Card"}
    </DropdownMenuItem>
  ) : (
    <Button className="gap-2 transition-all hover:scale-105 active:scale-95 shadow-sm">
      <Plus className="h-4 w-4" /> {isVi ? "Thêm thẻ" : "Add Card"}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{TriggerButton}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {mode === "create" ? (isVi ? "Thêm thẻ mới" : "Add New Card") : (isVi ? "Sửa thẻ" : "Edit Card")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Front Side */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="frontText" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isVi ? "Mặt trước (Câu hỏi)" : "Front (Question)"}
                </Label>
                <Textarea
                  id="frontText"
                  value={frontText}
                  onChange={(e) => setFrontText(e.target.value)}
                  placeholder={isVi ? "Nội dung câu hỏi..." : "What is..."}
                  className="min-h-[140px] resize-none focus-visible:ring-primary/20 border-border/60"
                />
              </div>
              <MediaManagerSection
                side="front"
                isVi={isVi}
                existingMedia={card?.media?.filter((m: any) => m.side === "front") || []}
                pendingFiles={frontMedia}
                onAddFiles={(files) => validateAndAddFiles(files, "front")}
                onRemovePending={(idx) => setFrontMedia(prev => prev.filter((_, i) => i !== idx))}
                onDeleteExisting={(id) => setDeletedMediaIds(prev => [...prev, id])}
                deletedIds={deletedMediaIds}
              />
            </div>

            {/* Back Side */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="backText" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isVi ? "Mặt sau (Câu trả lời)" : "Back (Answer)"}
                </Label>
                <Textarea
                  id="backText"
                  value={backText}
                  onChange={(e) => setBackText(e.target.value)}
                  placeholder={isVi ? "Câu trả lời là..." : "The answer is..."}
                  className="min-h-[140px] resize-none bg-muted/20 focus-visible:ring-primary/20 border-border/60"
                />
              </div>
              <MediaManagerSection
                side="back"
                isVi={isVi}
                existingMedia={card?.media?.filter((m: any) => m.side === "back") || []}
                pendingFiles={backMedia}
                onAddFiles={(files) => validateAndAddFiles(files, "back")}
                onRemovePending={(idx) => setBackMedia(prev => prev.filter((_, i) => i !== idx))}
                onDeleteExisting={(id) => setDeletedMediaIds(prev => [...prev, id])}
                deletedIds={deletedMediaIds}
              />
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t">
            <Label htmlFor="tags" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isVi ? "Nhãn dán (cách nhau bởi dấu phẩy)" : "Tags (comma separated)"}
            </Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={isVi ? "VD: quan trọng, từ vựng" : "e.g. important, vocab"}
              className="focus-visible:ring-primary/20 border-border/60"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="hover:bg-muted">
              {isVi ? "Hủy bỏ" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={createMut.isPending || updateMut.isPending}
              className="min-w-[120px] transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20"
            >
              {createMut.isPending || updateMut.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isVi ? "Đang lưu..." : "Saving..."}
                </div>
              ) : (
                isVi ? "Lưu thẻ" : "Save Card"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function DeleteCardDialog({ cardId, deckId, isVi }: { cardId: string; deckId: string; isVi?: boolean }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const deleteMut = useDeleteCard();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash className="mr-2 h-4 w-4" />
          {isVi ? "Xóa thẻ" : "Delete Card"}
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isVi ? "Xóa thẻ" : "Delete Card"}</DialogTitle>
          <DialogDescription>
            {isVi ? "Bạn có chắc chắn muốn xóa thẻ này? Hành động này không thể hoàn tác." : "Are you sure you want to delete this card? This action cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {isVi ? "Hủy" : "Cancel"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMut.mutate({ cardId, deckId }, {
              onSuccess: () => {
                setOpen(false);
                toast({ title: isVi ? "Đã xóa thẻ." : "Card deleted." });
              },
              onError: () => toast({ title: isVi ? "Lỗi khi xóa thẻ." : "Failed to delete card.", variant: "destructive" }),
            })}
            disabled={deleteMut.isPending}
          >
            {isVi ? "Xóa thẻ" : "Delete Card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlashcardListItem({ card, deckId, isVi }: { card: any; deckId: string; isVi?: boolean }) {
  const frontMedia = card.media?.filter((m: any) => m.side === "front") || [];
  const backMedia = card.media?.filter((m: any) => m.side === "back") || [];

  const renderMedia = (mediaItems: any[]) => {
    if (mediaItems.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-2 mb-3">
        {mediaItems.map((m: any) => (
          m.media_type === "image" ? (
            <img key={m.id} src={sanitizeMediaUrl(m.public_url)} alt="" className="h-16 w-16 object-cover rounded-md border shadow-sm" />
          ) : (
            <span key={m.id} className="inline-flex items-center gap-1 text-[10px] text-primary bg-primary/5 px-2 py-1 rounded-full border border-primary/10 h-fit">
              <Volume2 className="h-3 w-3" />
              <span className="capitalize font-medium">{isVi ? "Âm thanh" : "Audio"}</span>
            </span>
          )
        ))}
      </div>
    );
  };

  return (
    <Card className="overflow-hidden border-none shadow-sm hover:shadow-md transition-shadow group bg-card/50">
      <div className="flex flex-col md:flex-row min-h-[140px]">
        {/* FRONT SIDE */}
        <div className="flex-[1.2] p-4 flex flex-col border-b md:border-b-0 md:border-r border-border/50">
          <div className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            {isVi ? "MẶT TRƯỚC" : "FRONT"}
          </div>
          {renderMedia(frontMedia)}
          <div className="text-sm font-medium flex-1 pr-4 whitespace-pre-wrap">
            {card.front_text}
          </div>
          {card.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border/50">
              {card.tags.map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* BACK SIDE */}
        <div className="flex-1 p-4 bg-muted/20 flex flex-col relative">
          <div className="absolute top-2 right-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <CardFormDialog mode="edit" deckId={deckId} card={card} asDropdownItem isVi={isVi} />
                <DeleteCardDialog cardId={card.id} deckId={deckId} isVi={isVi} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            {isVi ? "MẶT SAU" : "BACK"}
          </div>
          {renderMedia(backMedia)}
          <div className="text-sm flex-1 pr-8 whitespace-pre-wrap">
            {card.back_text}
          </div>
        </div>
      </div>
    </Card>
  );
}

function MediaManagerSection({
  side,
  isVi,
  existingMedia,
  pendingFiles,
  onAddFiles,
  onRemovePending,
  onDeleteExisting,
  deletedIds
}: {
  side: "front" | "back";
  isVi: boolean;
  existingMedia: any[];
  pendingFiles: File[];
  onAddFiles: (files: FileList | null) => void;
  onRemovePending: (idx: number) => void;
  onDeleteExisting: (id: string) => void;
  deletedIds: string[];
}) {
  const inputId = `media-upload-${side}`;

  return (
    <div className="space-y-3 p-4 rounded-xl bg-muted/10 border border-border/50">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
          {isVi ? `Media mặt ${side === 'front' ? 'trước' : 'sau'}` : `${side === 'front' ? 'Front' : 'Back'} Media`}
        </Label>
        <div className="text-[9px] text-muted-foreground/60 flex items-center gap-1">
          <HelpCircle className="h-3 w-3" /> Max 5
        </div>
      </div>

      {/* Media List */}
      <div className="flex flex-wrap gap-2">
        {/* Existing */}
        {existingMedia.filter(m => !deletedIds.includes(m.id)).map((m) => (
          <div key={m.id} className="relative group rounded-lg border bg-card p-1.5 flex items-center gap-2 min-w-[110px] shadow-sm animate-in fade-in duration-300">
            {m.media_type === "audio" ? <Volume2 className="h-3.5 w-3.5 text-primary" /> : <Image className="h-3.5 w-3.5 text-primary" />}
            <span className="text-[9px] truncate flex-1 uppercase font-bold tracking-tighter">{m.media_type}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
              onClick={() => onDeleteExisting(m.id)}
            >
              <X className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ))}
        {/* Pending */}
        {pendingFiles.map((file, idx) => (
          <div key={idx} className="relative group rounded-lg border border-primary/20 bg-primary/5 p-1.5 flex items-center gap-2 min-w-[110px] shadow-sm animate-in zoom-in-95 duration-300">
            {file.type.startsWith("audio/") ? <Volume2 className="h-3.5 w-3.5 text-primary" /> : <Image className="h-3.5 w-3.5 text-primary" />}
            <span className="text-[9px] truncate flex-1 font-bold tracking-tighter italic">{file.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
              onClick={() => onRemovePending(idx)}
            >
              <X className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Mini Dropzone */}
      <div
        className="border-2 border-dashed border-muted-foreground/10 rounded-lg p-4 transition-all hover:border-primary/40 hover:bg-primary/5 cursor-pointer text-center group"
        onClick={() => document.getElementById(inputId)?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onAddFiles(e.dataTransfer.files);
        }}
      >
        <input
          id={inputId}
          type="file"
          multiple
          accept="image/*,audio/*"
          className="hidden"
          onChange={(e) => onAddFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-1.5">
          <Upload className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary transition-colors" />
          <div className="text-[10px] font-bold text-muted-foreground/60 group-hover:text-primary transition-colors uppercase tracking-widest">
            {isVi ? "Tải lên" : "Upload"}
          </div>
        </div>
      </div>
    </div>
  );
}

