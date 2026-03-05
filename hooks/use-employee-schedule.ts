import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface ScheduleDay {
    id?: string
    day_of_week: number
    is_working: boolean
    start_time: string | null
    end_time: string | null
}

export interface ScheduleException {
    id?: string
    exception_date: string
    is_working: boolean
    start_time: string | null
    end_time: string | null
    reason?: string | null
}

export function useEmployeeSchedule(employeeId: string) {
    return useQuery({
        queryKey: ['employee-schedule', employeeId],
        queryFn: async () => {
            const res = await fetch(`/api/employees/${employeeId}/schedule`)
            if (!res.ok) throw new Error('Failed to fetch schedule')
            return res.json() as Promise<{ schedule: ScheduleDay[]; exceptions: ScheduleException[] }>
        },
        enabled: !!employeeId,
    })
}

export function useSaveEmployeeSchedule(employeeId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (schedule: Omit<ScheduleDay, 'id'>[]) => {
            const res = await fetch(`/api/employees/${employeeId}/schedule`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schedule }),
            })
            if (!res.ok) throw new Error('Failed to save schedule')
            return res.json()
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-schedule', employeeId] }),
    })
}

export function useAddScheduleException(employeeId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (exc: Omit<ScheduleException, 'id'>) => {
            const res = await fetch(`/api/employees/${employeeId}/schedule/exceptions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(exc),
            })
            if (!res.ok) throw new Error('Failed to add exception')
            return res.json()
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-schedule', employeeId] }),
    })
}

export function useDeleteScheduleException(employeeId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (date: string) => {
            const res = await fetch(`/api/employees/${employeeId}/schedule/exceptions?date=${date}`, {
                method: 'DELETE',
            })
            if (!res.ok) throw new Error('Failed to delete exception')
            return res.json()
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-schedule', employeeId] }),
    })
}
