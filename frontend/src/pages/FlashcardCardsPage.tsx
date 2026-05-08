import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useListCards,
  useCreateCard,
  useUpdateCard,
  useDeleteCard,
  useGetDeck,
} from "@/hooks/use-flashcard-api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Label } from "@/components/ui/primitives";
import { Textarea } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n/useLanguage";
import { ArrowLeft, Plus, Search, MoreVertical, Edit, Trash, Play, Layers } from "lucide-react";
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
            <Button className="gap-2" disabled={!cards?.length}>
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
          <div className="grid gap-4">
            {filteredCards.map((card: any) => (
              <Card key={card.id} className="overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  <div className="flex-1 p-4 border-b md:border-b-0 md:border-r flex flex-col">
                    <div className="text-xs font-medium text-muted-foreground mb-2">{isVi ? "MẶT TRƯỚC" : "FRONT"}</div>
                    <div className="text-sm flex-1 whitespace-pre-wrap">
                      {card.front_text}
                    </div>
                    {card.tags && card.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {card.tags.map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 p-4 bg-muted/20 flex flex-col relative">
                    <div className="absolute top-2 right-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <CardFormDialog mode="edit" deckId={deckId} card={card} asDropdownItem isVi={isVi} />
                          <DeleteCardDialog cardId={card.id} deckId={deckId} isVi={isVi} />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">{isVi ? "MẶT SAU" : "BACK"}</div>
                    <div className="text-sm flex-1 pr-8 whitespace-pre-wrap">
                      {card.back_text}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
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
    </div>
  );
}

function CardFormDialog({
  mode,
  deckId,
  card,
  asDropdownItem,
  isVi,
}: {
  mode: "create" | "edit";
  deckId: string;
  card?: any;
  asDropdownItem?: boolean;
  isVi?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [frontText, setFrontText] = useState(card?.front_text || "");
  const [backText, setBackText] = useState(card?.back_text || "");
  const [tagsInput, setTagsInput] = useState(card?.tags?.join(", ") || "");

  const { toast } = useToast();
  const createMut = useCreateCard();
  const updateMut = useUpdateCard();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!frontText.trim() || !backText.trim()) return;

    const tags = tagsInput
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    if (mode === "create") {
      createMut.mutate({ deckId, front_text: frontText, back_text: backText, tags }, {
        onSuccess: () => {
          setOpen(false);
          toast({ title: isVi ? "Đã thêm thẻ." : "Card added." });
          setFrontText("");
          setBackText("");
          setTagsInput("");
        },
        onError: () => toast({ title: isVi ? "Lỗi thêm thẻ." : "Failed to add card.", variant: "destructive" }),
      });
    } else if (card) {
      updateMut.mutate({
        cardId: card.id,
        deckId,
        front_text: frontText,
        back_text: backText,
        tags,
      }, {
        onSuccess: () => {
          setOpen(false);
          toast({ title: isVi ? "Đã cập nhật thẻ." : "Card updated." });
        },
        onError: () => toast({ title: isVi ? "Lỗi cập nhật thẻ." : "Failed to update card.", variant: "destructive" }),
      });
    }
  };

  const TriggerButton = asDropdownItem ? (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        setOpen(true);
      }}
    >
      <Edit className="mr-2 h-4 w-4" />
      {isVi ? "Sửa thẻ" : "Edit Card"}
    </DropdownMenuItem>
  ) : (
    <Button className="gap-2">
      <Plus className="h-4 w-4" /> {isVi ? "Thêm thẻ" : "Add Card"}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{TriggerButton}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? (isVi ? "Thêm thẻ mới" : "Add New Card") : (isVi ? "Sửa thẻ" : "Edit Card")}</DialogTitle>
          <DialogDescription>
            {isVi ? "Nhập nội dung mặt trước và mặt sau cho flashcard này." : "Provide the front and back content for this flashcard."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="frontText">{isVi ? "Mặt trước (Câu hỏi)" : "Front (Question / Prompt)"}</Label>
              <Textarea
                id="frontText"
                value={frontText}
                onChange={(e) => setFrontText(e.target.value)}
                placeholder={isVi ? "Nội dung câu hỏi..." : "What is..."}
                className="min-h-[150px] resize-y"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="backText">{isVi ? "Mặt sau (Câu trả lời)" : "Back (Answer)"}</Label>
              <Textarea
                id="backText"
                value={backText}
                onChange={(e) => setBackText(e.target.value)}
                placeholder={isVi ? "Câu trả lời là..." : "The answer is..."}
                className="min-h-[150px] resize-y bg-muted/20"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tags">{isVi ? "Thẻ từ khóa (phân cách bằng dấu phẩy)" : "Tags (comma separated)"}</Label>
            <Input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={isVi ? "VD: react, hooks, frontend" : "e.g. react, hooks, frontend"}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {isVi ? "Hủy" : "Cancel"}
            </Button>
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
              {mode === "create" ? (isVi ? "Lưu thẻ mới" : "Save Card") : (isVi ? "Lưu thay đổi" : "Save Changes")}
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
