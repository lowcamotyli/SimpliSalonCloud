'use client'

import { useState } from 'react'
import { usePayroll, useGeneratePayroll, useDownloadPayrollPDF, useSendPayrollEmail } from '@/hooks/use-payroll'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { DollarSign, Download, Send, CreditCard, Users, Calendar, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'
import { useCurrentRole } from '@/hooks/use-current-role'
import { cn } from '@/lib/utils'

export default function PayrollPage() {
  const currentMonth = format(new Date(), 'yyyy-MM')
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set())
  const { hasPermission } = useCurrentRole()

  const { data: payroll, isLoading } = usePayroll(selectedMonth)
  const generateMutation = useGeneratePayroll()
  const { downloadPDF } = useDownloadPayrollPDF()
  const sendEmailMutation = useSendPayrollEmail()

  const toggleEmployee = (id: string) => {
    const newSet = new Set(expandedEmployees)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setExpandedEmployees(newSet)
  }

  if (!hasPermission('finance:view')) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-6 pb-8 px-4 sm:px-0">
        <Card className="glass border-rose-100">
          <CardContent className="py-12 text-center">
            <div className="mx-auto h-16 w-16 bg-rose-50 rounded-full flex items-center justify-center mb-4">
              <DollarSign className="h-8 w-8 text-rose-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Brak dostępu</h3>
            <p className="mt-2 text-gray-600 max-w-xs mx-auto">
              Nie masz uprawnień do przeglądania wynagrodzeń pracowników. Skontaktuj się z administratorem.
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-transparent">
            Wynagrodzenia
          </h1>
          <p className="text-gray-500 text-lg font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Rozliczenia i prowizje pracowników
          </p>
        </div>

        <div className="flex items-end gap-4 glass p-4 rounded-2xl border-white/40 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="month" className="text-xs font-bold uppercase tracking-wider text-gray-500">Miesiąc</Label>
            <Input
              id="month"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-xl border-gray-200 focus:ring-primary/20"
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className="gradient-button rounded-xl px-6 h-10 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
          >
            {generateMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Generuj
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-3xl" />)}
          </div>
        </div>
      ) : payroll?.entries?.length > 0 ? (
        <>
          {/* Summary Cards */}
          <div className="grid gap-6 sm:grid-cols-2">
            <Card className="glass overflow-hidden border-none shadow-xl shadow-blue-500/5 group hover:shadow-blue-500/10 transition-all">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <CreditCard className="h-16 w-16" />
              </div>
              <CardContent className="pt-8 pb-8">
                <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-1">Łączny przychód</p>
                <div className="text-4xl font-black text-gray-900 tracking-tight">
                  {payroll.totalRevenue.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} <span className="text-xl font-medium">zł</span>
                </div>
              </CardContent>
            </Card>

            <Card className="glass overflow-hidden border-none shadow-xl shadow-emerald-500/5 group hover:shadow-emerald-500/10 transition-all">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Users className="h-16 w-16" />
              </div>
              <CardContent className="pt-8 pb-8">
                <p className="text-sm font-bold text-emerald-600 uppercase tracking-widest mb-1">Łączne wypłaty</p>
                <div className="text-4xl font-black text-gray-900 tracking-tight">
                  {payroll.totalPayroll.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} <span className="text-xl font-medium">zł</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Employee payroll entries */}
          <div className="space-y-6">
            {payroll.entries.map((entry: any) => (
              <Card key={entry.employeeId} className="glass border-white/60 shadow-lg hover:shadow-xl transition-all rounded-3xl overflow-hidden group">
                <CardHeader className="pb-2 border-b border-gray-100/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold text-gray-900">
                          {entry.employeeName}
                        </CardTitle>
                        <Badge variant="secondary" className="mt-0.5 rounded-lg font-mono tracking-tighter text-[10px] bg-slate-100 text-slate-600 uppercase">
                          {entry.employeeCode}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl text-gray-500 hover:text-primary"
                        onClick={() => toggleEmployee(entry.employeeId)}
                      >
                        {expandedEmployees.has(entry.employeeId) ? (
                          <>Ukryj wizyty <ChevronUp className="ml-2 h-4 w-4" /></>
                        ) : (
                          <>Szczegóły <ChevronDown className="ml-2 h-4 w-4" /></>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-400 uppercase">Liczba wizyt</p>
                      <p className="text-2xl font-black text-gray-900">{entry.visitCount}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-400 uppercase">Przychód (U)</p>
                      <p className="text-2xl font-black text-gray-900">
                        {entry.totalRevenue.toFixed(2)} <span className="text-sm font-medium">zł</span>
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-400 uppercase">Próg (P)</p>
                      <p className="text-xl font-bold text-gray-600">
                        {entry.baseThreshold.toFixed(2)} <span className="text-xs font-medium">zł</span>
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-400 uppercase">Prowizja</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-black text-emerald-600">
                          {entry.commissionAmount.toFixed(2)} <span className="text-sm font-medium text-emerald-600/70">zł</span>
                        </p>
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] rounded-md font-bold">
                          {(entry.commissionRate * 100).toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-emerald-50/50 border border-emerald-100 p-4 group-hover:bg-emerald-50 transition-colors">
                      <p className="text-xs font-bold text-emerald-600/70 uppercase mb-1">Do wypłaty (W)</p>
                      <p className="text-3xl font-black text-emerald-700">
                        {entry.totalPayout.toFixed(2)} <span className="text-lg font-bold">zł</span>
                      </p>
                    </div>
                  </div>

                  {/* Visit Details Toggleable */}
                  {expandedEmployees.has(entry.employeeId) && (
                    <div className="mt-8 pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Lista wizyt w okresie</h4>
                      <div className="overflow-x-auto rounded-xl border border-gray-100">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-gray-500 font-bold">
                            <tr>
                              <th className="px-4 py-3">Data</th>
                              <th className="px-4 py-3">Klient</th>
                              <th className="px-4 py-3">Usługa</th>
                              <th className="px-4 py-3 text-right">Cena</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {entry.visits?.map((visit: any) => (
                              <tr key={visit.id} className="hover:bg-white transition-colors">
                                <td className="px-4 py-3 font-medium">{visit.date}</td>
                                <td className="px-4 py-3">{visit.clientName}</td>
                                <td className="px-4 py-3 text-gray-500">{visit.serviceName}</td>
                                <td className="px-4 py-3 text-right font-bold">{visit.price.toFixed(2)} zł</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl px-6 border-gray-200 hover:bg-white hover:shadow-md transition-all font-bold text-xs"
                      onClick={() => downloadPDF(entry, selectedMonth)}
                    >
                      <Download className="mr-2 h-4 w-4 text-primary" />
                      POBIERZ PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl px-6 border-gray-200 hover:bg-white hover:shadow-md transition-all font-bold text-xs"
                      disabled={sendEmailMutation.isPending}
                      onClick={() => sendEmailMutation.mutate({
                        employeeId: entry.employeeId,
                        employeeName: entry.employeeName,
                        month: selectedMonth,
                        totalPayout: entry.totalPayout
                      })}
                    >
                      <Send className="mr-2 h-4 w-4 text-blue-500" />
                      {sendEmailMutation.isPending ? 'WYSYŁANIE...' : 'WYŚLIJ EMAIL'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card className="glass border-white shadow-xl rounded-3xl">
          <CardContent className="py-20 text-center">
            <div className="mx-auto h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
              <DollarSign className="h-10 w-10 text-gray-300" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
              Brak rozliczeń
            </h3>
            <p className="mt-2 text-gray-500 max-w-sm mx-auto font-medium">
              W wybranym miesiącu {format(new Date(selectedMonth), 'MMMM yyyy', { locale: pl })} nie odnotowano jeszcze żadnych zakończonych wizyt.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
