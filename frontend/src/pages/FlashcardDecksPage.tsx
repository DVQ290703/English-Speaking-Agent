import { useState } from "react";
import {
  useListDecks,
  useCreateDeck,
  useUpdateDeck,
  useDeleteDeck,
  getListDecksQueryKey,
} from "@/hooks/use-flashcard-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Label } from "@/components/ui/primitives";
import { Textarea } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/useLanguage";
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash,
  Play,
  Library,
  Layers,
  BookOpen,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";

const DECK_COLORS = [
  "from-blue-500 to-blue-600",
  "from-violet-500 to-violet-600",
  "from-emerald-500 to-emerald-600",
  "from-orange-500 to-orange-600",
  "from-rose-500 to-rose-600",
  "from-cyan-500 to-cyan-600",
  "from-amber-500 to-amber-600",
  "from-indigo-500 to-indigo-600",
];

function getDeckColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return DECK_COLORS[Math.abs(hash) % DECK_COLORS.length];
}

function getDeckInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function FlashcardDecksPage() {
  const { data: decks, isLoading } = useListDecks();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const isVi = lang === "vi";

  const filteredDecks = decks?.filter(
    (d: any) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };

  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 28 } },
  };

  return (
    <div className="min-h-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{isVi ? "Bộ Thẻ" : "Decks"}</h1>
            <p className="text-muted-foreground mt-1">
              {decks ? `${decks.length} ${isVi ? "bộ sưu tập" : "collection"}${!isVi && decks.length !== 1 ? "s" : ""}` : (isVi ? "Quản lý bộ sưu tập học tập của bạn." : "Manage your learning collections.")}
            </p>
          </div>
          <div className="flex w-full sm:w-auto items-center gap-2">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={isVi ? "Tìm bộ thẻ..." : "Search decks..."}
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <DeckFormDialog mode="create" isVi={isVi} />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        ) : filteredDecks && filteredDecks.length > 0 ? (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {filteredDecks.map((deck: any) => {
              const color = getDeckColor(deck.id);
              const initials = getDeckInitials(deck.name);
              const hasDue = (deck.due_count ?? 0) > 0;

              return (
                <motion.div key={deck.id} variants={item}>
                  <div
                    className="group relative rounded-2xl border bg-card overflow-hidden cursor-pointer hover:shadow-lg hover:border-primary/40 transition-all duration-200"
                    onClick={() => navigate(`/flashcards/decks/${deck.id}/cards`)}
                  >
                    <div className={`h-2 w-full bg-gradient-to-r ${color}`} />

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={`flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold text-sm shadow-sm`}
                        >
                          {initials}
                        </div>

                        <div
                          className="flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DeckFormDialog mode="edit" deck={deck} asDropdownItem isVi={isVi} />
                              <DropdownMenuSeparator />
                              <DeleteDeckDialog deckId={deck.id} deckName={deck.name} isVi={isVi} />
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1">
                        <h3 className="font-semibold text-base leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                          {deck.name}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                          {deck.description || (isVi ? "Không có mô tả." : "No description.")}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Layers className="h-3.5 w-3.5" />
                          <span>{deck.card_count ?? 0} {isVi ? "thẻ" : "cards"}</span>
                        </div>
                        {hasDue && (
                          <div className="flex items-center gap-1.5 text-orange-500 font-medium">
                            <Play className="h-3.5 w-3.5 fill-orange-500" />
                            <span>{deck.due_count} {isVi ? "cần ôn hôm nay" : "due today"}</span>
                          </div>
                        )}
                      </div>

                      <div
                        className="mt-4 flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          className={`flex-1 gap-2 text-sm h-9 ${hasDue ? "" : "opacity-80"}`}
                          variant={hasDue ? "default" : "secondary"}
                          onClick={() => navigate(`/flashcards/decks/${deck.id}/study`)}
                        >
                          <Play className="h-3.5 w-3.5" />
                          {hasDue ? (isVi ? "Học ngay" : "Study now") : (isVi ? "Ôn tập" : "Review")}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          title={isVi ? "Quản lý thẻ" : "Manage cards"}
                          onClick={() => navigate(`/flashcards/decks/${deck.id}/cards`)}
                        >
                          <BookOpen className="h-4 w-4" />
                        </Button>
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
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl bg-muted/20">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Library className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">{isVi ? "Không tìm thấy bộ thẻ nào" : "No decks found"}</h3>
            <p className="text-muted-foreground max-w-xs mb-6 mt-1 text-sm">
              {search
                ? (isVi ? `Không có kết quả cho "${search}"` : `No results for "${search}"`)
                : (isVi ? "Tạo bộ thẻ đầu tiên của bạn để bắt đầu học." : "Create your first deck to start learning.")}
            </p>
            {!search && <DeckFormDialog mode="create" isVi={isVi} />}
          </div>
        )}
    </div>
  );
}

function DeckFormDialog({
  mode,
  deck,
  asDropdownItem,
  isVi,
}: {
  mode: "create" | "edit";
  deck?: any;
  asDropdownItem?: boolean;
  isVi?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(deck?.name || "");
  const [description, setDescription] = useState(deck?.description || "");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMut = useCreateDeck();
  const updateMut = useUpdateDeck();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (mode === "create") {
      createMut.mutate({ name, description }, {
        onSuccess: () => {
          setOpen(false);
          toast({ title: isVi ? "Đã tạo bộ thẻ thành công." : "Deck created successfully." });
          setName("");
          setDescription("");
        },
        onError: () => toast({ title: isVi ? "Lỗi khi tạo bộ thẻ." : "Failed to create deck.", variant: "destructive" }),
      });
    } else if (deck) {
      updateMut.mutate({ deckId: deck.id, name, description }, {
        onSuccess: () => {
          setOpen(false);
          toast({ title: isVi ? "Đã cập nhật bộ thẻ thành công." : "Deck updated successfully." });
        },
        onError: () => toast({ title: isVi ? "Lỗi khi cập nhật bộ thẻ." : "Failed to update deck.", variant: "destructive" }),
      });
    }
  };

  const TriggerButton = asDropdownItem ? (
    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
      <Edit className="mr-2 h-4 w-4" /> {isVi ? "Chỉnh sửa" : "Edit Deck"}
    </DropdownMenuItem>
  ) : (
    <Button className="gap-2 shrink-0">
      <Plus className="h-4 w-4" /> {isVi ? "Tạo Bộ Thẻ Mới" : "New Deck"}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{TriggerButton}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? (isVi ? "Tạo Bộ Thẻ Mới" : "Create New Deck") : (isVi ? "Chỉnh sửa Bộ Thẻ" : "Edit Deck")}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? (isVi ? "Sắp xếp flashcard của bạn vào một bộ sưu tập mới." : "Organize your flashcards into a new collection.")
              : (isVi ? "Cập nhật chi tiết bộ thẻ của bạn." : "Update your deck details.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{isVi ? "Tên bộ thẻ" : "Name"}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isVi ? "VD: Kỹ sư phần mềm" : "e.g., Engineering Onboarding"}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{isVi ? "Mô tả" : "Description"}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isVi ? "Mô tả tùy chọn..." : "Optional description..."}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {isVi ? "Hủy" : "Cancel"}
            </Button>
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
              {mode === "create" ? (isVi ? "Tạo" : "Create Deck") : (isVi ? "Lưu" : "Save Changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDeckDialog({ deckId, deckName, isVi }: { deckId: string; deckName: string; isVi?: boolean }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const deleteMut = useDeleteDeck();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); setOpen(true); }}
          className="text-destructive focus:text-destructive"
        >
          <Trash className="mr-2 h-4 w-4" /> {isVi ? "Xóa bộ thẻ" : "Delete Deck"}
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isVi ? "Xóa bộ thẻ" : "Delete Deck"}</DialogTitle>
          <DialogDescription>
            {isVi ? "Bạn có chắc chắn muốn xóa " : "Are you sure you want to delete "}
            <span className="font-semibold text-foreground">{deckName}</span>?
            {isVi ? " Hành động này sẽ xóa bộ thẻ và toàn bộ thẻ bên trong." : " This will delete the deck and all its cards."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{isVi ? "Hủy" : "Cancel"}</Button>
          <Button
            variant="destructive"
            onClick={() => deleteMut.mutate(deckId, {
              onSuccess: () => {
                setOpen(false);
                toast({ title: isVi ? "Đã xóa bộ thẻ." : "Deck deleted." });
              },
              onError: () => toast({ title: isVi ? "Lỗi khi xóa bộ thẻ." : "Failed to delete deck.", variant: "destructive" }),
            })}
            disabled={deleteMut.isPending}
          >
            {isVi ? "Xóa bộ thẻ" : "Delete Deck"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
