/**
 * HOUSE-ZEN — Media array input (photos) for CRUD forms.
 * Real mode  : uploads files to the public Storage bucket `hz-media`
 *              (policies: public read / authenticated write / owner manage).
 * Demo mode  : files become inline data URLs (no backend).
 * Both modes : external URLs can be pasted directly.
 * The FIRST photo is used as the vitrine cover.
 */

import { useRef, useState } from 'react';
import { ImagePlus, Link2, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/hooks/useTranslation';
import { isDemoMode } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase/client';
import { uuid } from '@/lib/utils';

const MAX_FILE_BYTES = 500 * 1024;
const BUCKET = 'hz-media';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read error'));
    reader.readAsDataURL(file);
  });
}

export function PhotosInput({ value, onChange }: { value: unknown; onChange: (v: string[]) => void }) {
  const { t } = useTranslation();
  const photos: string[] = Array.isArray(value)
    ? value.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function addUrls(urls: string[]) {
    onChange([...photos, ...urls.filter((u) => u && !photos.includes(u))]);
  }

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const added: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > MAX_FILE_BYTES) throw new Error(t('media.tooLarge'));
        if (isDemoMode()) {
          added.push(await readAsDataUrl(file));
        } else {
          const sb = getSupabaseClient();
          const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'jpg';
          const path = `${uuid()}.${ext}`;
          const { error: upErr } = await sb.storage
            .from(BUCKET)
            .upload(path, file, { contentType: file.type, cacheControl: '31536000' });
          if (upErr) throw upErr;
          const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
          added.push(data.publicUrl);
        }
      }
      addUrls(added);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('media.uploadFailed'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="photos">
          {photos.map((url, i) => (
            <li key={`${i}-${url.slice(-24)}`} className="group relative overflow-hidden rounded-md border bg-muted">
              <img src={url} alt={`photo ${i + 1}`} className="h-20 w-full object-cover sm:h-24" loading="lazy" />
              {i === 0 ? (
                <span
                  className="absolute left-1 top-1 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground"
                  title={t('media.hint')}
                >
                  ★
                </span>
              ) : null}
              <button
                type="button"
                aria-label={t('media.remove')}
                title={t('media.remove')}
                onClick={() => removeAt(i)}
                className="absolute right-1 top-1 rounded bg-destructive/90 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t('media.empty')}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
          aria-hidden="true"
          tabIndex={-1}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          {t('media.upload')}
        </Button>
        <div className="flex min-w-48 flex-1 items-center gap-1.5">
          <Input
            type="url"
            value={urlDraft}
            placeholder={t('media.urlPlaceholder')}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (urlDraft.trim()) addUrls([urlDraft.trim()]);
                setUrlDraft('');
              }
            }}
            aria-label={t('media.addUrl')}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!urlDraft.trim()}
            onClick={() => {
              addUrls([urlDraft.trim()]);
              setUrlDraft('');
            }}
          >
            <Link2 size={14} /> {t('media.addUrl')}
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">{t('media.hint')}</p>
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
