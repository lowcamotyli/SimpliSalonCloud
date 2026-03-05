'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Calendar, Plus, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react'
import {
    useEmployeeSchedule,
    useSaveEmployeeSchedule,
    useAddScheduleException,
    useDeleteScheduleException,
    type ScheduleDay,
    type ScheduleException,
} from '@/hooks/use-employee-schedule'
import { toast } from 'sonner'

const DAY_LABELS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] // pon–sob–niedz

interface EmployeeScheduleCardProps {
    employeeId: string
    employeeName: string
}

function EmployeeScheduleCard({ employeeId, employeeName }: EmployeeScheduleCardProps) {
    const [expanded, setExpanded] = useState(false)
    const [exceptionDialog, setExceptionDialog] = useState(false)
    const [localSchedule, setLocalSchedule] = useState<ScheduleDay[]>([])
    const [dirty, setDirty] = useState(false)
    const [newExc, setNewExc] = useState<Omit<ScheduleException, 'id'>>({
        exception_date: '',
        is_working: false,
        start_time: null,
        end_time: null,
        reason: '',
    })

    const { data, isLoading } = useEmployeeSchedule(employeeId)
    const saveMutation = useSaveEmployeeSchedule(employeeId)
    const addExcMutation = useAddScheduleException(employeeId)
    const deleteExcMutation = useDeleteScheduleException(employeeId)

    // Inicjalizuj lokalny stan gdy dane przychodzą (lub gdy refresh)
    const schedule: ScheduleDay[] = (() => {
        if (dirty) return localSchedule
        if (!data?.schedule) return []
        return data.schedule
    })()

    function getDayData(dow: number): ScheduleDay {
        return (
            schedule.find(s => s.day_of_week === dow) ?? {
                day_of_week: dow,
                is_working: false,
                start_time: null,
                end_time: null,
            }
        )
    }

    function updateDay(dow: number, patch: Partial<ScheduleDay>) {
        const existing = getDayData(dow)
        const updated = { ...existing, ...patch }
        const rest = schedule.filter(s => s.day_of_week !== dow)
        setLocalSchedule([...rest, updated])
        setDirty(true)
    }

    async function handleSave() {
        const rows = WEEK_ORDER.map(dow => {
            const d = getDayData(dow)
            return {
                day_of_week: dow,
                is_working: d.is_working,
                start_time: d.is_working ? (d.start_time ?? '09:00') : null,
                end_time: d.is_working ? (d.end_time ?? '17:00') : null,
            }
        })
        await saveMutation.mutateAsync(rows)
        setDirty(false)
        toast.success('Grafik zapisany')
    }

    async function handleAddException() {
        if (!newExc.exception_date) return
        await addExcMutation.mutateAsync(newExc)
        setExceptionDialog(false)
        setNewExc({ exception_date: '', is_working: false, start_time: null, end_time: null, reason: '' })
        toast.success('Wyjątek dodany')
    }

    async function handleDeleteException(date: string) {
        await deleteExcMutation.mutateAsync(date)
        toast.success('Wyjątek usunięty')
    }

    const workingDays = WEEK_ORDER.filter(dow => getDayData(dow).is_working)

    return (
        <Card className="border-none shadow-sm bg-white">
            <CardHeader
                className="cursor-pointer select-none pb-3"
                onClick={() => setExpanded(v => !v)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm">
                            {employeeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <h3 className="font-black text-gray-900">{employeeName}</h3>
                            <p className="text-xs text-muted-foreground">
                                {workingDays.length > 0
                                    ? `Aktywne dni: ${workingDays.map(d => DAY_LABELS[d].slice(0, 3)).join(', ')}`
                                    : 'Brak ustawionego grafiku'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {workingDays.length === 0 && (
                            <Badge variant="outline" className="text-rose-600 border-rose-200 text-[10px]">
                                Niedostępny
                            </Badge>
                        )}
                        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                </div>
            </CardHeader>

            {expanded && (
                <CardContent className="pt-0 space-y-6">
                    {isLoading ? (
                        <p className="text-sm text-muted-foreground animate-pulse">Ładowanie grafiku...</p>
                    ) : (
                        <>
                            {/* Grafik tygodniowy */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">Godziny pracy</h4>
                                <div className="space-y-2">
                                    {WEEK_ORDER.map(dow => {
                                        const d = getDayData(dow)
                                        return (
                                            <div
                                                key={dow}
                                                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                                            >
                                                <div className="w-28 flex-shrink-0">
                                                    <span className="text-sm font-bold text-gray-700">{DAY_LABELS[dow]}</span>
                                                </div>
                                                <Switch
                                                    checked={d.is_working}
                                                    onCheckedChange={checked => updateDay(dow, { is_working: checked })}
                                                    id={`sw-${employeeId}-${dow}`}
                                                />
                                                {d.is_working ? (
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <Input
                                                            type="time"
                                                            value={d.start_time ?? '09:00'}
                                                            onChange={e => updateDay(dow, { start_time: e.target.value })}
                                                            className="h-8 w-28 text-sm rounded-lg"
                                                        />
                                                        <span className="text-gray-400 text-sm font-bold">–</span>
                                                        <Input
                                                            type="time"
                                                            value={d.end_time ?? '17:00'}
                                                            onChange={e => updateDay(dow, { end_time: e.target.value })}
                                                            className="h-8 w-28 text-sm rounded-lg"
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400 font-medium">Wolne</span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button
                                    size="sm"
                                    disabled={saveMutation.isPending || !dirty}
                                    onClick={handleSave}
                                    className="gradient-button rounded-xl font-bold"
                                >
                                    <Save className="h-4 w-4 mr-2" />
                                    {saveMutation.isPending ? 'Zapisywanie...' : 'Zapisz grafik'}
                                </Button>
                            </div>

                            {/* Wyjątki */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">
                                        Wyjątki ({data?.exceptions?.length ?? 0})
                                    </h4>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setExceptionDialog(true)}
                                        className="h-7 rounded-lg text-xs font-bold"
                                    >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Dodaj wyjątek
                                    </Button>
                                </div>

                                {data?.exceptions && data.exceptions.length > 0 ? (
                                    <div className="space-y-1">
                                        {data.exceptions.map(exc => (
                                            <div
                                                key={exc.exception_date}
                                                className="flex items-center justify-between p-2 rounded-lg bg-amber-50 border border-amber-100"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-3 w-3 text-amber-600" />
                                                    <span className="text-sm font-bold text-gray-700">{exc.exception_date}</span>
                                                    {exc.is_working && exc.start_time && exc.end_time ? (
                                                        <span className="text-xs text-emerald-700 font-medium">
                                                            {exc.start_time.slice(0, 5)}–{exc.end_time.slice(0, 5)}
                                                        </span>
                                                    ) : (
                                                        <Badge variant="outline" className="border-rose-200 text-rose-600 text-[10px]">
                                                            Wolne
                                                        </Badge>
                                                    )}
                                                    {exc.reason && (
                                                        <span className="text-xs text-gray-400 italic">{exc.reason}</span>
                                                    )}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleDeleteException(exc.exception_date)}
                                                    disabled={deleteExcMutation.isPending}
                                                    className="h-6 w-6 p-0 text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">Brak wyjątków w nadchodzącym czasie.</p>
                                )}
                            </div>
                        </>
                    )}
                </CardContent>
            )}

            {/* Dialog dodawania wyjątku */}
            <Dialog open={exceptionDialog} onOpenChange={setExceptionDialog}>
                <DialogContent className="max-w-sm glass rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="gradient-text font-black">Dodaj wyjątek</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-600">Data</Label>
                            <Input
                                type="date"
                                value={newExc.exception_date}
                                min={new Date().toISOString().split('T')[0]}
                                onChange={e => setNewExc(v => ({ ...v, exception_date: e.target.value }))}
                                className="h-10 rounded-xl"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch
                                checked={newExc.is_working}
                                onCheckedChange={checked => setNewExc(v => ({ ...v, is_working: checked }))}
                                id={`exc-working-${employeeId}`}
                            />
                            <Label htmlFor={`exc-working-${employeeId}`} className="font-bold text-sm">
                                {newExc.is_working ? 'Pracuje (niestandardowe godziny)' : 'Dzień wolny / nieobecność'}
                            </Label>
                        </div>
                        {newExc.is_working && (
                            <div className="flex items-center gap-2">
                                <Input
                                    type="time"
                                    value={newExc.start_time ?? '09:00'}
                                    onChange={e => setNewExc(v => ({ ...v, start_time: e.target.value }))}
                                    className="h-10 rounded-xl"
                                />
                                <span className="text-gray-400 font-bold">–</span>
                                <Input
                                    type="time"
                                    value={newExc.end_time ?? '17:00'}
                                    onChange={e => setNewExc(v => ({ ...v, end_time: e.target.value }))}
                                    className="h-10 rounded-xl"
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-600">Powód (opcjonalnie)</Label>
                            <Input
                                placeholder="np. urlop, choroba..."
                                value={newExc.reason ?? ''}
                                onChange={e => setNewExc(v => ({ ...v, reason: e.target.value }))}
                                className="h-10 rounded-xl"
                            />
                        </div>
                        <Button
                            className="w-full gradient-button rounded-xl font-black"
                            disabled={!newExc.exception_date || addExcMutation.isPending}
                            onClick={handleAddException}
                        >
                            {addExcMutation.isPending ? 'Zapisywanie...' : 'Dodaj wyjątek'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    )
}

interface ScheduleTabProps {
    employees: Array<{ id: string; first_name: string; last_name: string | null }>
}

export function ScheduleTab({ employees }: ScheduleTabProps) {
    if (employees.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="h-16 w-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                    <Calendar className="h-8 w-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Brak pracowników</h3>
                <p className="text-gray-500 text-sm">Dodaj pracowników w zakładce Lista, aby ustawić grafik.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Kliknij w pracownika, aby rozwinąć i ustawić grafik. Pracownicy bez grafiku nie będą widoczni na stronie rezerwacji.
            </p>
            {employees.map(emp => (
                <EmployeeScheduleCard
                    key={emp.id}
                    employeeId={emp.id}
                    employeeName={`${emp.first_name}${emp.last_name ? ` ${emp.last_name}` : ''}`}
                />
            ))}
        </div>
    )
}
