'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, FileText, Loader2, Search } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { useState } from 'react'

type Invoice = {
    id: string
    invoice_number: string
    created_at: string
    total_cents: number
    status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
    pdf_url?: string
    currency: string
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    paid: 'default', // will use primary color
    open: 'secondary',
    draft: 'secondary',
    void: 'destructive',
    uncollectible: 'destructive',
}

const STATUS_LABELS: Record<string, string> = {
    paid: 'Opłacona',
    open: 'Otwarta',
    draft: 'Szkic',
    void: 'Anulowana',
    uncollectible: 'Nieściągalna',
}

export default function InvoicesPage() {
    const params = useParams()
    const slug = params?.slug as string
    const [searchQuery, setSearchQuery] = useState('')

    const { data: invoices, isLoading } = useQuery<Invoice[]>({
        queryKey: ['invoices', slug],
        queryFn: async () => {
            const res = await fetch(`/api/subscriptions/${slug}/invoices`)
            if (!res.ok) throw new Error('Failed to fetch invoices')
            return res.json()
        },
    })

    // Filter invoices
    const filteredInvoices = invoices?.filter(invoice =>
        invoice.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())
    ) || []

    return (
        <div className="max-w-[1400px] mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <Link
                        href={`/${slug}/billing`}
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Powrót do subskrypcji
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <FileText className="h-6 w-6 text-primary" />
                        Faktury
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Tutaj znajdziesz historię wszystkich faktur i płatności
                    </p>
                </div>

                {/* Search */}
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Szukaj po numerze..."
                        className="pl-9 bg-background"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Invoices List */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                        <p>Ładowanie faktur...</p>
                    </div>
                ) : filteredInvoices.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-muted/50 border-border">
                                <TableHead>Numer faktury</TableHead>
                                <TableHead>Data wystawienia</TableHead>
                                <TableHead>Kwota</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Akcje</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredInvoices.map((invoice) => (
                                <TableRow key={invoice.id} className="hover:bg-muted/30 border-border">
                                    <TableCell className="font-medium text-foreground">
                                        {invoice.invoice_number}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {new Date(invoice.created_at).toLocaleDateString('pl-PL')}
                                    </TableCell>
                                    <TableCell className="font-semibold text-foreground">
                                        {(invoice.total_cents / 100).toFixed(2)} {invoice.currency}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_VARIANTS[invoice.status] || 'outline'}>
                                            {STATUS_LABELS[invoice.status] || invoice.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {invoice.pdf_url ? (
                                            <Button variant="ghost" size="sm" asChild>
                                                <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer" className="gap-2">
                                                    <Download className="h-4 w-4" />
                                                    Pobierz
                                                </a>
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">
                                                Generowanie...
                                            </span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center">
                        <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                            <FileText className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">Brak faktur</h3>
                        <p className="text-muted-foreground max-w-sm mt-1">
                            Nie wygenerowano jeszcze żadnych faktur dla tego konta. Faktury pojawią się tutaj automatycznie po opłaceniu subskrypcji.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
