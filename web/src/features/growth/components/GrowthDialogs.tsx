import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { GrowthOverview } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { AuthenticatedImage } from '@/shared/ui/AuthenticatedImage';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import {
  GrowthIconMark,
  growthIconLabel,
  growthIconOptions,
  isPresetGrowthIcon,
  isUploadedGrowthIcon,
} from '@/shared/ui/GrowthIcons';
import { GROWTH_KIND } from '@/shared/constants/growth.constants';

export async function growthIconValue(form: FormData) {
  const iconFile = form.get('iconFile');
  if (iconFile instanceof File && iconFile.size > 0) {
    const uploaded = await api.uploadGrowthSkillIcon(iconFile);
    return uploaded.url;
  }

  const icon = String(form.get('icon') || 'SPARKLES').trim();
  return icon || 'SPARKLES';
}

export function CreateGrowthDialog({
  type,
  skills,
  onClose,
  onCreated,
}: {
  type: 'attribute' | 'skill' | 'reward' | null;
  skills: GrowthOverview['skills'];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [error, setError] = useState('');
  const categories = useQuery({
    queryKey: ['growth', 'item-categories'],
    queryFn: () => api.growthItemCategories(),
    enabled: type === 'reward',
  });
  const create = useMutation({
    mutationFn: async (form: FormData) => {
      if (type === 'skill' || type === 'attribute')
        return api.createGrowthSkill({
          name: String(form.get('name')),
          description: String(form.get('description')),
          kind: type === 'attribute' ? GROWTH_KIND.ATTRIBUTE : GROWTH_KIND.SKILL,
          icon: await growthIconValue(form),
          color: String(form.get('color') || 'TEAL'),
          baseXp: Number(form.get('baseXp')) || 100,
        });
      if (type === 'reward') {
        const listedInShop = form.get('listedInShop') === 'on';
        return api.createGrowthReward({
          name: String(form.get('name')),
          description: String(form.get('description')),
          icon: String(form.get('icon') || 'GIFT'),
          color: String(form.get('color') || 'ROSE'),
          price: listedInShop ? Number(form.get('price')) : null,
          listedInShop,
          repeatable: form.get('repeatable') === 'on',
          categoryId: String(form.get('categoryId') || '') || null,
        });
      }
      throw new Error('Unknown dialog type');
    },
    onSuccess: () => {
      onClose();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Could not save Growth item.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    create.mutate(new FormData(event.currentTarget));
  }
  return (
    <Dialog open={Boolean(type)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {type === 'attribute' ? 'Create an attribute' : type === 'skill' ? 'Create a skill' : 'Create a reward'}
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <Field label={type === 'reward' ? 'Reward name' : 'Name'} name="name" required />
          <div>
            <Label htmlFor="growth-description">Description</Label>
            <Textarea id="growth-description" name="description" className="mt-1" />
          </div>
          {(type === 'skill' || type === 'attribute') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <GrowthIconField id="growth-icon" defaultValue="SPARKLES" />
                <div>
                  <Label htmlFor="growth-color">Color</Label>
                  <select
                    id="growth-color"
                    name="color"
                    className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {['TEAL', 'VIOLET', 'AMBER', 'EMERALD', 'ROSE', 'BLUE', 'ORANGE'].map((color) => (
                      <option key={color} value={color}>
                        {color.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Field
                label="XP needed for level 2"
                name="baseXp"
                type="number"
                min="10"
                max="10000"
                defaultValue="100"
              />
            </>
          )}
          {type === 'reward' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Icon" name="icon" defaultValue="GIFT" />
                <Field label="Color" name="color" defaultValue="ROSE" />
              </div>
              <div>
                <Label htmlFor="growth-category">Category</Label>
                <select
                  id="growth-category"
                  name="categoryId"
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Uncategorized</option>
                  {categories.data?.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input name="listedInShop" type="checkbox" defaultChecked /> List this item in the shop
              </label>
              <Field label="Price in coins" name="price" type="number" min="1" defaultValue="10" />
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input name="repeatable" type="checkbox" defaultChecked /> Can be purchased more than once
              </label>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={create.isPending}>Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, name, ...input } = props;
  return (
    <div>
      <Label htmlFor={`growth-${name}`}>{label}</Label>
      <Input id={`growth-${name}`} name={name} className="mt-1" {...input} />
    </div>
  );
}

function GrowthIconField({ id, defaultValue }: { id: string; defaultValue: string }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState(isPresetGrowthIcon(defaultValue) ? defaultValue : 'CUSTOM');
  const showUpload = selectedIcon === 'CUSTOM';
  const currentUploadedIcon = isUploadedGrowthIcon(defaultValue);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Icon</Label>
      <div className="flex items-center gap-2">
        <select
          id={`${id}-preset`}
          value={selectedIcon}
          onChange={(event) => {
            const nextIcon = event.target.value;
            setSelectedIcon(nextIcon);
            if (nextIcon !== 'CUSTOM') {
              setFileName('');
              setPreviewUrl((current) => {
                if (current) URL.revokeObjectURL(current);
                return null;
              });
              if (fileRef.current) fileRef.current.value = '';
            }
          }}
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
        >
          <option value="CUSTOM">Custom upload</option>
          {growthIconOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background text-muted-foreground">
          {showUpload && (previewUrl || currentUploadedIcon) ? (
            previewUrl ? (
              <img
                src={previewUrl}
                alt="Icon preview"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="h-full w-full object-cover"
              />
            ) : (
              <AuthenticatedImage src={defaultValue} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <GrowthIconMark icon={selectedIcon === 'CUSTOM' ? defaultValue : selectedIcon} className="h-4 w-4" />
          )}
        </span>
      </div>
      <Input
        ref={fileRef}
        id={id}
        name="iconFile"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          setFileName(file?.name ?? '');
          setPreviewUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return file ? URL.createObjectURL(file) : null;
          });
        }}
      />
      {showUpload && (
        <label
          htmlFor={id}
          className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm transition hover:bg-muted/50"
        >
          <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-medium text-foreground">Upload</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {fileName || (currentUploadedIcon ? 'Keep current image' : 'No file selected')}
          </span>
        </label>
      )}
      <input type="hidden" name="icon" value={selectedIcon === 'CUSTOM' ? defaultValue || 'SPARKLES' : selectedIcon} />
      <p className="text-[11px] text-muted-foreground">
        {showUpload ? 'Use your own PNG, JPG, WebP, or GIF.' : `${growthIconLabel(selectedIcon)} is a Lucide SVG icon.`}
      </p>
    </div>
  );
}
