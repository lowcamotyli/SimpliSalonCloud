'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

type ServiceMediaItem = {
  id: string
  public_url: string
  alt_text?: string | null
}

type ServiceMediaGalleryProps = {
  serviceId: string
}

const MAX_MEDIA_ITEMS = 5
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024

export function ServiceMediaGallery({ serviceId }: ServiceMediaGalleryProps) {
  const [media, setMedia] = useState<ServiceMediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchMedia = async () => {
      setIsLoading(true)

      try {
        const response = await fetch(`/api/services/${serviceId}/media`, {
          method: 'GET',
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error('Nie udało się pobrać galerii')
        }

        const data = (await response.json()) as ServiceMediaItem[] | { media?: ServiceMediaItem[] }
        const nextMedia = Array.isArray(data) ? data : (data.media ?? [])
        if (isMounted) {
          setMedia(nextMedia.slice(0, MAX_MEDIA_ITEMS))
        }
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof Error ? error.message : 'Nie udało się pobrać galerii')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void fetchMedia()

    return () => {
      isMounted = false
    }
  }, [serviceId])

  const handleDelete = async (mediaId: string) => {
    setDeletingId(mediaId)

    try {
      const response = await fetch(`/api/services/${serviceId}/media/${mediaId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Nie udało się usunąć zdjęcia')
      }

      setMedia((current) => current.filter((item) => item.id !== mediaId))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nie udało się usunąć zdjęcia')
    } finally {
      setDeletingId(null)
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error('Maksymalny rozmiar zdjęcia to 2 MB')
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await fetch(`/api/services/${serviceId}/media`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Nie udało się przesłać zdjęcia')
      }

      const data = (await response.json()) as ServiceMediaItem | { media?: ServiceMediaItem; image?: ServiceMediaItem }
      const nextItem = 'id' in data ? data : (data.media ?? data.image)

      if (!nextItem) {
        throw new Error('Serwer nie zwrócił zdjęcia')
      }

      setMedia((current) => [...current, nextItem].slice(0, MAX_MEDIA_ITEMS))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nie udało się przesłać zdjęcia')
    } finally {
      setIsUploading(false)
    }
  }

  const isFull = media.length >= MAX_MEDIA_ITEMS

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Galeria zdjęć</h3>
        <p className="text-sm text-muted-foreground">Dodaj maksymalnie 5 zdjęć usługi.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {media.map((item) => (
          <div key={item.id} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
            <img
              src={item.public_url}
              alt={item.alt_text || ''}
              className="object-cover w-full h-full"
            />
            <button
              type="button"
              className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleDelete(item.id)}
              disabled={deletingId === item.id}
              aria-label="Usuń zdjęcie"
            >
              {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </button>
          </div>
        ))}

        {isLoading ? (
          <div className="flex aspect-square items-center justify-center rounded-md border border-dashed bg-muted/40">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {isUploading && media.length < MAX_MEDIA_ITEMS ? (
          <div className="flex aspect-square items-center justify-center rounded-md border border-dashed bg-muted/40">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void handleFileChange(event)}
      />

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading || isFull}
      >
        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        Dodaj zdjęcie
      </Button>
    </div>
  )
}
