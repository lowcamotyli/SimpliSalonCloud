import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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

      doc.setFontSize(20)
      doc.text('Rozliczenie Wynagrodzenia', 105, 20, { align: 'center' })

      doc.setFontSize(12)
      doc.text(`Pracownik: ${entry.employeeName}`, 20, 40)
      doc.text(`Okres: ${month}`, 20, 50)
      doc.text(`Data wygenerowania: ${new Date().toLocaleDateString()}`, 20, 60)

      const tableData = [
        ['Liczba wizyt', `${entry.visitCount}`],
        ['Łączny przychód (U)', `${entry.totalRevenue.toFixed(2)} zł`],
        ['Próg (P)', `${entry.baseThreshold.toFixed(2)} zł`],
        ['Prowizja (%)', `${(entry.commissionRate * 100).toFixed(1)}%`],
        ['Kwota prowizji', `${entry.commissionAmount.toFixed(2)} zł`],
        ['Podstawa (S)', `${entry.baseSalary.toFixed(2)} zł`],
        ['DO WYPŁATY (W)', `${entry.totalPayout.toFixed(2)} zł`],
      ]

      autoTable(doc, {
        startY: 70,
        head: [['Opis', 'Wartość']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [40, 167, 69] }, // Green
      })

      doc.save(`wynagrodzenie-${entry.employeeName.replace(/\s+/g, '_')}-${month}.pdf`)
      toast.success('PDF został wygenerowany')
    } catch (error) {
      console.error('PDF Error:', error)
      toast.error('Błąd podczas generowania PDF')
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