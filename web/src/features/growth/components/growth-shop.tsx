import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Boxes, CheckCircle2, Gift, Plus, Search, ShoppingBag, WalletCards } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { GrowthShopReward } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

type PricedGrowthReward = GrowthShopReward & { price: number };
type ShopMode = 'shop' | 'inventory';

export function Shop({
  rewards,
  balance,
  onCreate,
  onRedeem,
  pending,
  offline,
  isLoading,
  error,
}: {
  rewards: Awaited<ReturnType<typeof api.growthRewards>>;
  balance: number;
  onCreate: () => void;
  onRedeem: (id: string) => void;
  pending: boolean;
  offline: boolean;
  isLoading: boolean;
  error: Error | null;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ShopMode>('shop');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [coinAlert, setCoinAlert] = useState<{ name: string; price: number } | null>(null);
  const [purchaseReward, setPurchaseReward] = useState<PricedGrowthReward | null>(null);
  const [consumeItem, setConsumeItem] = useState<
    Awaited<ReturnType<typeof api.growthInventory>>[number]['item'] | null
  >(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [editingReward, setEditingReward] = useState<PricedGrowthReward | null>(null);

  const inventory = useQuery({ queryKey: ['growth', 'inventory'], queryFn: () => api.growthInventory() });
  const categories = useQuery({ queryKey: ['growth', 'item-categories'], queryFn: () => api.growthItemCategories() });
  const consume = useMutation({
    mutationFn: (id: string) => api.consumeGrowthInventoryItem(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['growth', 'inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['growth', 'inventory-history'] }),
      ]);
    },
  });
  const createCategory = useMutation({
    mutationFn: (name: string) => api.createGrowthItemCategory({ name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['growth', 'item-categories'] }),
  });
  const updateItem = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<GrowthShopReward> & { archived?: boolean } }) =>
      api.updateGrowthItem(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['growth'] }),
  });

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleRewards = rewards.filter(
    (r): r is PricedGrowthReward =>
      !r.archivedAt &&
      r.listedInShop !== false &&
      r.price != null &&
      (categoryId === 'all' || r.categoryId === categoryId || (categoryId === 'uncategorized' && !r.categoryId)) &&
      (!normalizedSearch || `${r.name} ${r.description}`.toLocaleLowerCase().includes(normalizedSearch)),
  );
  const redemptionCount = (r: (typeof visibleRewards)[number]) => r._count?.redemptions ?? 0;
  const redeemedCount = visibleRewards.filter((r) => !r.repeatable && redemptionCount(r) > 0).length;
  const affordableCount = visibleRewards.filter(
    (r) => (r.repeatable || redemptionCount(r) === 0) && balance >= r.price,
  ).length;
  const handlePurchase = (r: (typeof visibleRewards)[number], sold: boolean) => {
    if (sold || pending) return;
    if (balance < r.price) {
      setCoinAlert({ name: r.name, price: r.price });
      return;
    }
    setPurchaseReward(r);
  };

  if (mode === 'inventory') {
    return (
      <InventoryView
        inventory={inventory}
        consume={consume}
        search={search}
        normalizedSearch={normalizedSearch}
        setSearch={setSearch}
        setMode={setMode}
        setConsumeItem={setConsumeItem}
        dialogs={
          <ShopDialogs
            coinAlert={coinAlert}
            setCoinAlert={setCoinAlert}
            purchaseReward={purchaseReward}
            setPurchaseReward={setPurchaseReward}
            pending={pending}
            onRedeem={onRedeem}
            consumeItem={consumeItem}
            setConsumeItem={setConsumeItem}
            consume={consume}
            categoryDialogOpen={categoryDialogOpen}
            setCategoryDialogOpen={setCategoryDialogOpen}
            categoryName={categoryName}
            setCategoryName={setCategoryName}
            createCategory={createCategory}
            editingReward={editingReward}
            setEditingReward={setEditingReward}
            updateItem={updateItem}
          />
        }
      />
    );
  }

  return (
    <section className="space-y-5">
      <ModeControls mode={mode} setMode={setMode} search={search} setSearch={setSearch} />
      <div className="growth-feature-card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="itu-eyebrow mb-2 flex items-center gap-2">
              <ShoppingBag className="h-3.5 w-3.5" /> Reward shop
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Rewards</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[460px]">
            <ShopStat icon={WalletCards} label="Balance" value={balance.toLocaleString()} accent />
            <ShopStat icon={CheckCircle2} label="Affordable" value={String(affordableCount)} />
            <ShopStat icon={Gift} label="Redeemed" value={String(redeemedCount)} />
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Buy rewards with coins earned from completed tasks, habits, focus, and study.
          </p>
          <Button onClick={onCreate} className="gap-2 sm:w-auto">
            <Plus className="h-4 w-4" /> New reward
          </Button>
        </div>
      </div>
      <CategoryFilter
        categories={categories.data ?? []}
        categoryId={categoryId}
        setCategoryId={setCategoryId}
        setCategoryName={setCategoryName}
        setCategoryDialogOpen={setCategoryDialogOpen}
      />
      {offline && (
        <p className="mb-4 rounded-xl border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          Offline changes will sync when you reconnect.
        </p>
      )}
      {isLoading && <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Loading rewards...</p>}
      {error && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {error.message}
        </p>
      )}
      {!isLoading && !error && visibleRewards.length === 0 && <EmptyState onCreate={onCreate} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleRewards.map((reward) => {
          const redeemed = redemptionCount(reward);
          const sold = !reward.repeatable && redeemed > 0;
          const affordable = balance >= reward.price;
          return (
            <article
              key={reward.id}
              className={`growth-card group flex min-h-[240px] flex-col p-5 ${sold ? 'opacity-70' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                  <Gift className="h-5 w-5" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    {reward.price.toLocaleString()}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${sold ? 'bg-muted text-muted-foreground' : affordable ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200' : 'bg-muted text-foreground'}`}
                  >
                    {sold ? 'Redeemed' : affordable ? 'Available' : 'Save up'}
                  </span>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setEditingReward(reward)}
                  >
                    Edit
                  </button>
                </div>
              </div>
              <h3 className="mt-5 text-xl font-black leading-tight">{reward.name}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
                {reward.description || 'A reward chosen by you.'}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <p className="font-bold text-foreground">{reward.repeatable ? 'Repeatable' : 'One-time'}</p>
                  <p className="mt-1 text-muted-foreground">{redeemed} redeemed</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <p className="font-bold text-foreground">{affordable ? 'Balance after buy' : 'Short by'}</p>
                  <p className={`mt-1 ${affordable ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300'}`}>
                    {affordable
                      ? (balance - reward.price).toLocaleString()
                      : Math.abs(balance - reward.price).toLocaleString()}
                  </p>
                </div>
              </div>
              <Button
                className="mt-auto w-full"
                disabled={pending || sold}
                variant={affordable && !sold ? 'default' : 'outline'}
                onClick={() => handlePurchase(reward, sold)}
              >
                {sold ? 'Redeemed' : `${reward.price.toLocaleString()} ◉`}
              </Button>
            </article>
          );
        })}
      </div>
      <ShopDialogs
        coinAlert={coinAlert}
        setCoinAlert={setCoinAlert}
        purchaseReward={purchaseReward}
        setPurchaseReward={setPurchaseReward}
        pending={pending}
        onRedeem={onRedeem}
        consumeItem={consumeItem}
        setConsumeItem={setConsumeItem}
        consume={consume}
        categoryDialogOpen={categoryDialogOpen}
        setCategoryDialogOpen={setCategoryDialogOpen}
        categoryName={categoryName}
        setCategoryName={setCategoryName}
        createCategory={createCategory}
        editingReward={editingReward}
        setEditingReward={setEditingReward}
        updateItem={updateItem}
      />
    </section>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ShopStat({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: typeof Award;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`growth-stat ${accent ? 'is-coin' : ''}`}>
      <Icon className={`h-4 w-4 ${accent ? 'text-amber-600' : 'text-primary'}`} />
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

function ModeControls({
  mode,
  setMode,
  search,
  setSearch,
}: {
  mode: ShopMode;
  setMode: (value: ShopMode) => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <div className="growth-toolbar">
      <div className="growth-segmented">
        <button
          type="button"
          className={`min-h-11 rounded-lg px-5 text-sm font-bold ${mode === 'shop' ? 'is-active' : ''}`}
          onClick={() => setMode('shop')}
        >
          <ShoppingBag className="mr-2 inline h-4 w-4" /> Shop
        </button>
        <button
          type="button"
          className={`min-h-11 rounded-lg px-5 text-sm font-bold ${mode === 'inventory' ? 'is-active' : ''}`}
          onClick={() => setMode('inventory')}
        >
          <Boxes className="mr-2 inline h-4 w-4" /> Inventory
        </button>
      </div>
      <div className="relative flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={mode === 'shop' ? 'Search the shop' : 'Search your inventory'}
          className="h-11 bg-background pl-9"
        />
      </div>
    </div>
  );
}

function CategoryFilter({
  categories,
  categoryId,
  setCategoryId,
  setCategoryName,
  setCategoryDialogOpen,
}: {
  categories: Array<{ id: string; name: string }>;
  categoryId: string;
  setCategoryId: (v: string) => void;
  setCategoryName: (v: string) => void;
  setCategoryDialogOpen: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Shop categories">
      {[
        { id: 'all', name: 'All' },
        ...categories.map((c) => ({ id: c.id, name: c.name })),
        { id: 'uncategorized', name: 'Uncategorized' },
      ].map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => setCategoryId(c.id)}
          className={`min-h-10 rounded-full border px-4 text-xs font-bold ${categoryId === c.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
        >
          {c.name}
        </button>
      ))}
      <button
        type="button"
        className="min-h-10 rounded-full border border-dashed border-primary/50 px-4 text-xs font-bold text-primary"
        onClick={() => {
          setCategoryName('');
          setCategoryDialogOpen(true);
        }}
      >
        <Plus className="mr-1 inline h-3.5 w-3.5" /> Category
      </button>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="growth-empty-state">
      <div className="growth-empty-state__icon">
        <Gift className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-xl font-black">No rewards yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Create rewards you want to buy with coins.</p>
      <Button onClick={onCreate} className="mt-5 gap-2">
        <Plus className="h-4 w-4" /> New reward
      </Button>
    </div>
  );
}

function InventoryView({
  inventory,
  consume,
  search,
  normalizedSearch,
  setSearch,
  setMode,
  setConsumeItem,
  dialogs,
}: {
  inventory: any;
  consume: any;
  search: string;
  normalizedSearch: string;
  setSearch: any;
  setMode: any;
  setConsumeItem: any;
  dialogs: any;
}) {
  const balances = (inventory.data ?? []).filter(
    ({ item }: any) =>
      !normalizedSearch || `${item.name} ${item.description}`.toLocaleLowerCase().includes(normalizedSearch),
  );
  return (
    <section className="space-y-5">
      <ModeControls mode="inventory" setMode={setMode} search={search} setSearch={setSearch} />
      <div className="growth-feature-card">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-700">
            <Boxes className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Inventory</p>
            <h2 className="text-3xl font-black tracking-tight">Rewards ready to use.</h2>
          </div>
        </div>
      </div>
      {inventory.isLoading ? (
        <p className="rounded-2xl border p-6 text-sm text-muted-foreground">Loading inventory…</p>
      ) : null}
      {!inventory.isLoading && !balances.length ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <Gift className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-black">Your inventory is empty</h3>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {balances.map(({ item, quantity }: any) => (
          <article key={item.id} className="growth-card p-5">
            <div className="flex items-start justify-between">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                <Gift className="h-5 w-5" />
              </span>
              <span className="rounded-full bg-teal-500/10 px-3 py-1 text-sm font-black text-teal-700 dark:text-teal-300">
                {quantity} owned
              </span>
            </div>
            <h3 className="mt-4 text-xl font-black">{item.name}</h3>
            <p className="mt-1 min-h-10 text-sm text-muted-foreground">
              {item.description || 'A reward ready when you are.'}
            </p>
            <Button
              className="mt-5 h-11 w-full"
              variant="outline"
              disabled={consume.isPending}
              onClick={() => setConsumeItem(item)}
            >
              Use one
            </Button>
          </article>
        ))}
      </div>
      {dialogs}
    </section>
  );
}

function ShopDialogs({
  coinAlert,
  setCoinAlert,
  purchaseReward,
  setPurchaseReward,
  pending,
  onRedeem,
  consumeItem,
  setConsumeItem,
  consume,
  categoryDialogOpen,
  setCategoryDialogOpen,
  categoryName,
  setCategoryName,
  createCategory,
  editingReward,
  setEditingReward,
  updateItem,
}: any) {
  return (
    <>
      <Dialog open={Boolean(coinAlert)} onOpenChange={(open) => !open && setCoinAlert(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Not enough coins</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setCoinAlert(null)}>OK</Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(purchaseReward)}
        onOpenChange={(open) => !open && setPurchaseReward(null)}
        title="Buy reward?"
        description={
          purchaseReward ? `Spend ${purchaseReward.price.toLocaleString()} coins on "${purchaseReward.name}"?` : ''
        }
        confirmLabel="Buy"
        isPending={pending}
        onConfirm={() => {
          if (purchaseReward) {
            onRedeem(purchaseReward.id);
            setPurchaseReward(null);
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(consumeItem)}
        onOpenChange={(open) => !open && setConsumeItem(null)}
        title="Use item?"
        description={consumeItem ? `Use one ${consumeItem.name}?` : ''}
        confirmLabel="Use one"
        isPending={consume.isPending}
        onConfirm={() => {
          if (consumeItem) consume.mutate(consumeItem.id, { onSuccess: () => setConsumeItem(null) });
        }}
      />
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const name = categoryName.trim();
              if (!name) return;
              createCategory.mutate(name, {
                onSuccess: () => {
                  setCategoryName('');
                  setCategoryDialogOpen(false);
                },
              });
            }}
          >
            <Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCategory.isPending || !categoryName.trim()}>
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editingReward)} onOpenChange={(open) => !open && setEditingReward(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
          </DialogHeader>
          {editingReward ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const name = String(f.get('name') || '').trim();
                const price = Number(f.get('price'));
                if (!name || price < 1) return;
                updateItem.mutate(
                  { id: editingReward.id, data: { name, price } },
                  { onSuccess: () => setEditingReward(null) },
                );
              }}
            >
              <div className="space-y-2">
                <Label htmlFor={`edit-name-${editingReward.id}`}>Item name</Label>
                <Input id={`edit-name-${editingReward.id}`} name="name" defaultValue={editingReward.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`edit-price-${editingReward.id}`}>Price</Label>
                <Input
                  id={`edit-price-${editingReward.id}`}
                  name="price"
                  type="number"
                  min="1"
                  defaultValue={editingReward.price}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingReward(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateItem.isPending}>
                  Save
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
