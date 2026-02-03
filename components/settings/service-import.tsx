'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { SettingsCard } from '@/components/settings/settings-card'
import { Badge } from '@/components/ui/badge'
import { Download, Upload, FileUp, Loader2 } from 'lucide-react'
import { importServices } from '@/lib/actions/service.actions'
import { toast } from 'sonner'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function ServiceImport() {
    const [isImporting, setIsImporting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const params = useParams()
    const slug = params.slug as string

    const { data: salon } = useQuery({
        queryKey: ['salon', slug],
        queryFn: async () => {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('salons')
                .select('id')
                .eq('slug', slug)
                .single()
            if (error) throw error
            return data as { id: string }
        }
    })

    const downloadTemplate = () => {
        const headers = ['Kategoria', 'Podkategoria', 'Nazwa usługi', 'Cena (zł)', 'Czas (min)']
        const sampleData = [
            ['Fryzjerstwo', 'Strzyżenie', 'Strzyżenie damskie', '120.00', '60'],
            ['Fryzjerstwo', 'Strzyżenie', 'Strzyżenie męskie', '60.00', '30'],
            ['Kosmetyka', 'Paznokcie', 'Manicure hybrydowy', '100.00', '75']
        ]

        const csvContent = [
            headers.join(','),
            ...sampleData.map(row => row.join(','))
        ].join('\n')

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', 'szablon_importu_uslug.csv')
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file || !salon) return

        setIsImporting(true)
        const reader = new FileReader()

        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string
                const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)

                if (lines.length < 2) {
                    toast.error('Plik jest pusty lub nie zawiera danych')
                    setIsImporting(false)
                    return
                }

                // Simple CSV parser (assuming no commas in values for now)
                const services = lines.slice(1).map(line => {
                    const [category, subcategory, name, price, duration] = line.split(',').map(v => v.trim())
                    return {
                        category,
                        subcategory,
                        name,
                        price,
                        duration
                    }
                })

                await importServices(salon.id, services)
                toast.success(`Pomyślnie zaimportowano ${services.length} usług`)
                if (fileInputRef.current) fileInputRef.current.value = ''
            } catch (error: any) {
                console.error('Import error:', error)
                toast.error('Błąd podczas importu: ' + (error.message || 'Nieznany błąd'))
            } finally {
                setIsImporting(false)
            }
        }

        reader.readAsText(file)
    }

    return (
        <SettingsCard
            title="Import Usług"
            description="Pobierz szablon CSV, wypełnij go swoimi usługami i wgraj tutaj, aby szybko dodać ofertę salonu."
            action={<Badge variant="outline">Narzędzie</Badge>}
        >
            <div className="flex flex-col sm:flex-row gap-4">
                <Button variant="outline" onClick={downloadTemplate} className="flex-1">
                    <Download className="mr-2 h-4 w-4" />
                    Pobierz szablon
                </Button>
                <div className="flex-1">
                    <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        disabled={isImporting}
                    />
                    <Button
                        className="w-full"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                    >
                        {isImporting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Upload className="mr-2 h-4 w-4" />
                        )}
                        {isImporting ? 'Importowanie...' : 'Wgraj plik i importuj'}
                    </Button>
                </div>
            </div>
        </SettingsCard>
    )
}
