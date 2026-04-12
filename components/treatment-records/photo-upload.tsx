'use client'

import React, { useState, useEffect, FormEvent } from 'react'
import {
  AlertTriangle,
  Upload,
  Trash2,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

type TreatmentPhoto = {
  id: string
  treatment_record_id: string
  photo_type: 'before' | 'after' | 'during' | 'other'
  storage_path: string
  taken_at: string
  notes: string | null
  signed_url?: string
}

interface PhotoUploadProps {
  treatmentRecordId: string
  clientId: string
  hasHealthConsent: boolean
  isOwnerOrManager: boolean
  onPhotoAdded?: (photo: TreatmentPhoto) => void
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const photoTypeTranslations: Record<TreatmentPhoto['photo_type'], string> = {
  before: 'Przed zabiegiem',
  after: 'Po zabiegu',
  during: 'W trakcie',
  other: 'Inne',
}

export function PhotoUpload({
  treatmentRecordId,
  hasHealthConsent,
  isOwnerOrManager,
  onPhotoAdded,
}: PhotoUploadProps) {
  const [photos, setPhotos] = useState<TreatmentPhoto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [photoType, setPhotoType] =
    useState<TreatmentPhoto['photo_type']>('before')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!hasHealthConsent) {
      setIsLoading(false)
      return
    }

    const fetchPhotos = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await fetch(
          `/api/treatment-photos?treatment_record_id=${treatmentRecordId}`,
        )
        if (!response.ok) {
          throw new Error('Nie udało się pobrać zdjęć.')
        }
        const data: TreatmentPhoto[] = await response.json()
        setPhotos(data)
      } catch (err) {
        console.error(err)
        setError(
          err instanceof Error
            ? err.message
            : 'Wystąpił nieznany błąd podczas ładowania zdjęć.',
        )
      } finally {
        setIsLoading(false)
      }
    }

    fetchPhotos()
  }, [treatmentRecordId, hasHealthConsent])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE) {
        setUploadError('Plik jest za duży. Maksymalny rozmiar to 10MB.')
        setFile(null)
        e.target.value = ''
        return
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
      if (!allowedTypes.includes(selectedFile.type)) {
        setUploadError('Nieprawidłowy format pliku. Dozwolone formaty: JPG, PNG, WebP.')
        setFile(null)
        e.target.value = ''
        return
      }
      setFile(selectedFile)
    }
  }
  
  const handleUpload = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) {
      setUploadError('Proszę wybrać plik do wysłania.')
      return
    }
    
    setUploadError(null)
    setIsUploading(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('treatment_record_id', treatmentRecordId)
    formData.append('photo_type', photoType)
    formData.append('notes', notes)

    try {
      const response = await fetch('/api/treatment-photos', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Nie udało się wysłać zdjęcia.')
      }

      const newPhoto: TreatmentPhoto = await response.json()
      setPhotos((prev) => [newPhoto, ...prev])
      onPhotoAdded?.(newPhoto)

      // Reset form
      setFile(null)
      setPhotoType('before')
      setNotes('')
      const fileInput = document.getElementById('photo-file-input') as HTMLInputElement
      if (fileInput) fileInput.value = ''

    } catch (err) {
      console.error(err)
      setUploadError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (photoId: string) => {
    if (!isOwnerOrManager) return
    
    // Optimistically remove from UI
    const originalPhotos = [...photos]
    setPhotos(prev => prev.filter(p => p.id !== photoId))

    try {
      const response = await fetch(`/api/treatment-photos/${photoId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        // Revert if API call fails
        setPhotos(originalPhotos)
        const errorData = await response.json()
        console.error('Failed to delete photo:', errorData.error)
        alert(`Nie udało się usunąć zdjęcia: ${errorData.error}`)
      }
    } catch (err) {
      // Revert if API call fails
      setPhotos(originalPhotos)
      console.error('Error deleting photo:', err)
      alert('Wystąpił błąd podczas usuwania zdjęcia.')
    }
  }


  if (!hasHealthConsent) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-red-800">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm">
          Klient nie wyraził zgody zdrowotnej. Dokumentacja fotograficzna jest
          niedostępna.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {isOwnerOrManager ? (
      <form onSubmit={handleUpload} className="border p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-lg">Dodaj nowe zdjęcie</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="photo-file-input">Plik ze zdjęciem</Label>
                <Input id="photo-file-input" type="file" onChange={handleFileChange} accept="image/jpeg,image/png,image/webp" />
            </div>
            <div className="space-y-2">
                <Label htmlFor="photo-type">Typ zdjęcia</Label>
                 <Select value={photoType} onValueChange={(v: TreatmentPhoto['photo_type']) => setPhotoType(v)}>
                    <SelectTrigger id="photo-type">
                        <SelectValue placeholder="Wybierz typ..." />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(photoTypeTranslations).map(([key, value]) => (
                            <SelectItem key={key} value={key}>{value}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
        <div className="space-y-2">
            <Label htmlFor="photo-notes">Notatki (opcjonalnie)</Label>
            <Textarea id="photo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dodaj opcjonalne notatki..." />
        </div>
        {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
        <Button type="submit" disabled={!file || isUploading}>
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {isUploading ? 'Wysyłanie...' : 'Wyślij zdjęcie'}
        </Button>
      </form>
      ) : (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Dokumentacja fotograficzna jest dostępna w trybie tylko do odczytu.
        </div>
      )}

      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Istniejące zdjęcia</h3>
        {isLoading ? (
          <div className="flex items-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Ładowanie zdjęć...</span>
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-red-800">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center text-gray-500 border-2 border-dashed rounded-lg p-8">
            <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2">Brak zdjęć dla tego zabiegu.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group border rounded-lg overflow-hidden">
                <img
                  src={photo.signed_url}
                  alt={`Zdjęcie typu ${photoTypeTranslations[photo.photo_type]}`}
                  className="w-full h-48 object-cover"
                />
                <div className="p-3 bg-white">
                    <div className="flex justify-between items-start">
                        <div>
                            <Badge variant="secondary">{photoTypeTranslations[photo.photo_type]}</Badge>
                            <p className="text-xs text-gray-500 mt-1">
                                {new Date(photo.taken_at).toLocaleDateString('pl-PL', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                                })}
                            </p>
                        </div>
                        {isOwnerOrManager && (
                            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDelete(photo.id)}>
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Usuń zdjęcie</span>
                            </Button>
                        )}
                    </div>
                     {photo.notes && <p className="text-sm text-gray-600 mt-2 pt-2 border-t">{photo.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
