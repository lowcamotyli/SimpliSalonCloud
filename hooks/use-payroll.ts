import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ROBOTO_REGULAR, ROBOTO_BOLD } from '@/lib/fonts/roboto-base64'
// jspdf and jspdf-autotable will be dynamic imported on demand

export function usePayroll(month: string) {
  return useQuery({
    queryKey: ['payroll', month],
    queryFn: async () => {
      const res = await fetch(`/api/payroll?month=${month}`)
      if (!res.ok) throw new Error('Failed to fetch payroll')
      return res.json()
    },
    enabled: !!month,
  })
}

export function useSendPayrollEmail() {
  return useMutation({
    mutationFn: async (payload: {
      employeeId: string
      employeeName: string
      month: string
      totalPayout: number
    }) => {
      const res = await fetch('/api/payroll/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to send email')
      }

      return res.json()
    },
    onSuccess: () => {
      toast.success('Email został wysłany (symulacja)')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDownloadPayrollPDF() {
  const downloadPDF = async (entry: any, month: string) => {
    try {
      const { jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const doc = new jsPDF()

      // Register fonts
      doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR)
      doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
      doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD)
      doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')
      doc.setFont('Roboto')

      // Colors
      const PRIMARY_PURPLE: [number, number, number] = [124, 58, 237]
      const TEXT_DARK: [number, number, number] = [31, 41, 55]
      const TEXT_MUTED: [number, number, number] = [107, 114, 128]
      const CARD_BG: [number, number, number] = [249, 250, 251]

      // --- Header ---
      doc.setFillColor(PRIMARY_PURPLE[0], PRIMARY_PURPLE[1], PRIMARY_PURPLE[2])
      doc.rect(0, 0, 210, 45, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFont('Roboto', 'bold')
      doc.setFontSize(24)
      doc.text('SIMPLI SALON', 20, 25)
      doc.setFont('Roboto', 'normal')
      doc.setFontSize(10)
      doc.text('INTELIGENTNE ZARZĄDZANIE SALONEM', 20, 32)

      doc.setFontSize(14)
      doc.setFont('Roboto', 'bold')
      doc.text('RAPORT WYNAGRODZENIA', 190, 26, { align: 'right' })

      // --- Employee & Period Info ---
      doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2])
      doc.setFontSize(10)
      doc.setFont('Roboto', 'normal')
      doc.text('PRACOWNIK:', 20, 60)
      doc.setFont('Roboto', 'bold')
      doc.setFontSize(14)
      doc.text(entry.employeeName.toUpperCase(), 20, 68)

      doc.setFont('Roboto', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2])
      doc.text(`Okres: ${month}`, 20, 75)
      doc.text(`Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}`, 190, 75, { align: 'right' })

      // --- Summary Cards ---
      const startY = 85
      const cardWidth = 55
      const cardHeight = 25
      const spacing = 10

      // Card 1: Przychód
      doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2])
      doc.roundedRect(20, startY, cardWidth, cardHeight, 3, 3, 'F')
      doc.setFontSize(9)
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2])
      doc.text('ŁĄCZNY PRZYCHÓD', 25, startY + 8)
      doc.setFontSize(12)
      doc.setFont('Roboto', 'bold')
      doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2])
      doc.text(`${entry.totalRevenue.toFixed(2)} zł`, 25, startY + 18)

      // Card 2: Prowizja
      doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2])
      doc.roundedRect(20 + cardWidth + spacing, startY, cardWidth, cardHeight, 3, 3, 'F')
      doc.setFontSize(9)
      doc.setFont('Roboto', 'normal')
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2])
      doc.text('KWOTA PROWIZJI', 20 + cardWidth + spacing + 5, startY + 8)
      doc.setFontSize(12)
      doc.setFont('Roboto', 'bold')
      doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2])
      doc.text(`${entry.commissionAmount.toFixed(2)} zł`, 20 + cardWidth + spacing + 5, startY + 18)

      // Card 3: Podstawa
      doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2])
      doc.roundedRect(20 + (cardWidth + spacing) * 2, startY, cardWidth, cardHeight, 3, 3, 'F')
      doc.setFontSize(9)
      doc.setFont('Roboto', 'normal')
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2])
      doc.text('WYNAGR. PODSTAWOWE', 20 + (cardWidth + spacing) * 2 + 5, startY + 8)
      doc.setFontSize(12)
      doc.setFont('Roboto', 'bold')
      doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2])
      doc.text(`${entry.baseSalary.toFixed(2)} zł`, 20 + (cardWidth + spacing) * 2 + 5, startY + 18)

      // --- Breakdown Section ---
      doc.setFontSize(10)
      doc.setFont('Roboto', 'normal')
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2])
      doc.text('SZCZEGÓŁY OBLICZEŃ:', 20, startY + 40)

      const calcData = [
        ['Liczba obsłużonych wizyt', `${entry.visitCount}`],
        ['Próg naliczania prowizji', `${entry.baseThreshold.toFixed(2)} zł`],
        ['Stawka prowizji', `${(entry.commissionRate * 100).toFixed(1)}%`],
      ]

      autoTable(doc, {
        startY: startY + 42,
        body: calcData,
        theme: 'plain',
        styles: { fontSize: 9, font: 'Roboto', cellPadding: 2, textColor: [TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]] as any },
        columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 20 }
      })

      // --- Total Payout Large ---
      const totalY = (doc as any).lastAutoTable.finalY + 15
      doc.setFillColor(PRIMARY_PURPLE[0], PRIMARY_PURPLE[1], PRIMARY_PURPLE[2])
      doc.roundedRect(20, totalY, 170, 20, 2, 2, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont('Roboto', 'bold')
      doc.text('KWOTA DO WYPŁATY (ŁĄCZNIE):', 30, totalY + 13)
      doc.setFontSize(18)
      doc.text(`${entry.totalPayout.toFixed(2)} zł`, 180, totalY + 13, { align: 'right' })

      // --- Visits Detail ---
      if (entry.visits && entry.visits.length > 0) {
        doc.addPage()

        // Header on second page
        doc.setFillColor(PRIMARY_PURPLE[0], PRIMARY_PURPLE[1], PRIMARY_PURPLE[2])
        doc.rect(0, 0, 210, 20, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(12)
        doc.setFont('Roboto', 'bold')
        doc.text(`SZCZEGÓŁOWA LISTA WIZYT - ${entry.employeeName.toUpperCase()}`, 20, 13)

        const visitData = entry.visits.map((v: any) => [
          v.date,
          v.clientName,
          v.serviceName,
          `${v.price.toFixed(2)} zł`
        ])

        autoTable(doc, {
          startY: 30,
          head: [['DATA', 'KLIENT', 'USŁUGA', 'CENA']],
          body: visitData,
          theme: 'striped',
          headStyles: { fillColor: [PRIMARY_PURPLE[0], PRIMARY_PURPLE[1], PRIMARY_PURPLE[2]], font: 'Roboto', fontStyle: 'bold' },
          styles: { fontSize: 9, font: 'Roboto', cellPadding: 4 },
          columnStyles: { 3: { halign: 'right' } },
          alternateRowStyles: { fillColor: [250, 250, 252] }
        })
      }

      // Footer with page numbers
      const pageCount = (doc as any).internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2])
        doc.text(`Strona ${i} z ${pageCount}`, 190, 285, { align: 'right' })
        doc.text('Generowane systemowo przez Simpli Salon Cloud', 20, 285)
      }

      doc.save(`wynagrodzenie-${entry.employeeName.replace(/\s+/g, '_')}-${month}.pdf`)
      toast.success('Pomyślnie wygenerowano raport PDF')
    } catch (error) {
      console.error('PDF Error:', error)
      toast.error('Błąd podczas generowania pliku PDF')
    }
  }

  return { downloadPDF }
}

export function useGeneratePayroll() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (month: string) => {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to generate payroll')
      }

      return res.json()
    },
    onSuccess: (data, month) => {
      queryClient.invalidateQueries({ queryKey: ['payroll', month] })
      toast.success('Wynagrodzenia wygenerowane pomyślnie')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}