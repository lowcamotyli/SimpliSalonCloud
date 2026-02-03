'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Loader2, Upload, X, User } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

interface ImageUploadProps {
    value?: string
    onChange: (url: string) => void
    onRemove: () => void
    salonId: string
    folder?: string
}

export function ImageUpload({
    value,
    onChange,
    onRemove,
    salonId,
    folder = 'avatars'
}: ImageUploadProps) {
    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = createClient()

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            toast.error('Proszę wybrać plik graficzny')
            return
        }

        if (file.size > 2 * 1024 * 1024) {
            toast.error('Plik jest zbyt duży (max 2MB)')
            return
        }

        try {
            setIsUploading(true)
            const fileExt = file.name.split('.').pop()
            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
            const filePath = `${salonId}/${fileName}`

            const { error: uploadError } = await supabase.storage
                .from(folder)
                .upload(filePath, file)

            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
                .from(folder)
                .getPublicUrl(filePath)

            onChange(publicUrl)
            toast.success('Zdjęcie wgrane pomyślnie')
        } catch (error: any) {
            console.error('Upload error:', error)
            toast.error('Błąd podczas wgrywania: ' + error.message)
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="relative h-32 w-32 rounded-full overflow-hidden border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 group">
                {value ? (
                    <>
                        <Image
                            src={value}
                            alt="Avatar"
                            fill
                            className="object-cover"
                        />
                        <button
                            onClick={(e) => {
                                e.preventDefault()
                                onRemove()
                            }}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X className="h-6 w-6 text-white" />
                        </button>
                    </>
                ) : (
                    <User className="h-12 w-12 text-gray-300" />
                )}
                {isUploading && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                    </div>
                )}
            </div>

            <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                onChange={handleUpload}
                accept="image/*"
                disabled={isUploading}
            />

            {!value && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                >
                    <Upload className="h-4 w-4 mr-2" />
                    Wgraj zdjęcie
                </Button>
            )}
        </div>
    )
}
