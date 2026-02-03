'use client'

import { useState } from 'react'
import { usePayroll, useGeneratePayroll, useDownloadPayrollPDF, useSendPayrollEmail } from '@/hooks/use-payroll'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DollarSign, Download, Send } from 'lucide-react'
import { format } from 'date-fns'
import { useCurrentRole } from '@/hooks/use-current-role'

export default function PayrollPage() {
  const currentMonth = format(new Date(), 'yyyy-MM')
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const { hasPermission } = useCurrentRole()

  const { data: payroll, isLoading } = usePayroll(selectedMonth)
  const generateMutation = useGeneratePayroll()
  const { downloadPDF } = useDownloadPayrollPDF()
  const sendEmailMutation = useSendPayrollEmail()

  if (!hasPermission('finance:view')) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-6 pb-8 px-4 sm:px-0">
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Brak dostępu</h3>
            <p className="mt-2 text-gray-600">
              Nie masz uprawnień do przeglądania wynagrodzeń.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleGenerate = async () => {
    if (confirm(`Czy na pewno chcesz wygenerować wynagrodzenia za ${selectedMonth}?`)) {
      await generateMutation.mutateAsync(selectedMonth)
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-8 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Wynagrodzenia
          </h1>
          <p className="text-gray-500 text-base font-medium">Rozliczenia pracowników</p>
        </div>
      </div>

      {/* Month selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="month">Miesiąc</Label>
              <Input
                id="month"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              Generuj wynagrodzenia
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-12">Ładowanie...</div>
      ) : payroll?.entries?.length > 0 ? (
        <>
          {/* Summary */}
          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Łączny przychód
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {payroll.totalRevenue.toFixed(2)} zł
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Łączne wynagrodzenia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {payroll.totalPayroll.toFixed(2)} zł
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Employee payroll entries */}
          <div className="space-y-4">
            {payroll.entries.map((entry: any) => (
              <Card key={entry.employeeId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-green-600" />
                      {entry.employeeName}
                    </CardTitle>
                    <Badge variant="secondary">{entry.employeeCode}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <p className="text-sm text-gray-600">Liczba wizyt</p>
                      <p className="text-lg font-semibold">{entry.visitCount}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Przychód (U)</p>
                      <p className="text-lg font-semibold">
                        {entry.totalRevenue.toFixed(2)} zł
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Próg (P)</p>
                      <p className="text-lg font-semibold">
                        {entry.baseThreshold.toFixed(2)} zł
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Prowizja</p>
                      <p className="text-lg font-semibold">
                        {entry.commissionAmount.toFixed(2)} zł
                      </p>
                      <p className="text-xs text-gray-500">
                        ({(entry.commissionRate * 100).toFixed(1)}%)
                      </p>
                    </div>
                    <div className="rounded-lg bg-green-50 p-3">
                      <p className="text-sm text-gray-600">Wypłata (W)</p>
                      <p className="text-2xl font-bold text-green-700">
                        {entry.totalPayout.toFixed(2)} zł
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadPDF(entry, selectedMonth)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={sendEmailMutation.isPending}
                      onClick={() => sendEmailMutation.mutate({
                        employeeId: entry.employeeId,
                        employeeName: entry.employeeName,
                        month: selectedMonth,
                        totalPayout: entry.totalPayout
                      })}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {sendEmailMutation.isPending ? 'Wysyłanie...' : 'Wyślij email'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              Brak rozliczeń
            </h3>
            <p className="mt-2 text-gray-600">
              Brak zakończonych wizyt w wybranym miesiącu
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
