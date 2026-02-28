'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  UserPlus,
  Trash2,
  Loader2,
  Calendar,
  User,
  Scissors
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

interface PendingEmail {
  id: string;
  message_id: string;
  subject: string | null;
  body_snippet: string | null;
  parsed_data: {
    clientName?: string;
    clientPhone?: string;
    serviceName?: string;
    employeeName?: string;
    price?: number;
    bookingDate?: string;
    bookingTime?: string;
  } | null;
  failure_reason: 'parse_failed' | 'service_not_found' | 'employee_not_found' | 'other';
  failure_detail: string | null;
  status: 'pending' | 'resolved' | 'ignored';
  created_at: string;
}

interface Service {
  id: string;
  name: string;
  price: number;
  duration: number;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string | null;
}

export function BooksyPendingEmails({ salonId }: { salonId: string }) {
  const queryClient = useQueryClient();
  const [selectedEmail, setSelectedEmail] = useState<PendingEmail | null>(null);
  const [targetServiceId, setTargetServiceId] = useState<string>('');
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>('');

  // 1. Fetch pending emails
  const { data: pendingData, isLoading: isLoadingPending } = useQuery({
    queryKey: ['booksy-pending', salonId],
    queryFn: async () => {
      const res = await fetch('/api/integrations/booksy/pending?status=pending');
      if (!res.ok) throw new Error('Failed to fetch pending emails');
      return res.json() as Promise<{ pending: PendingEmail[]; count: number }>;
    },
    enabled: !!salonId,
  });

  // 2. Fetch active services
  const { data: services } = useQuery<Service[]>({
    queryKey: ['services-active', salonId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price, duration')
        .eq('salon_id', salonId)
        .eq('active', true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!salonId,
  });

  // 3. Fetch active employees
  const { data: employees } = useQuery<Employee[]>({
    queryKey: ['employees-active', salonId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('salon_id', salonId)
        .is('deleted_at', null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!salonId,
  });

  // Mutation: Ignore email
  const ignoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integrations/booksy/pending/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ignored' }),
      });
      if (!res.ok) throw new Error('Błąd podczas ignorowania');
    },
    onSuccess: () => {
      toast.success('Email został zignorowany');
      queryClient.invalidateQueries({ queryKey: ['booksy-pending', salonId] });
    },
    onError: () => toast.error('Nie udało się zignorować emaila'),
  });

  // Mutation: Create booking (Assign)
  const assignMutation = useMutation({
    mutationFn: async ({
      id,
      serviceId,
      employeeId,
    }: {
      id: string;
      serviceId: string;
      employeeId: string;
    }) => {
      const res = await fetch(`/api/integrations/booksy/pending/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, employeeId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Błąd podczas tworzenia rezerwacji');
      }
    },
    onSuccess: () => {
      toast.success('Rezerwacja została utworzona pomyślnie');
      queryClient.invalidateQueries({ queryKey: ['booksy-pending', salonId] });
      setSelectedEmail(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleOpenAssign = (email: PendingEmail) => {
    setSelectedEmail(email);

    // Attempt auto-match for service
    const emailServiceName = email.parsed_data?.serviceName ?? '';
    const matchedService = services?.find(
      (s) =>
        s.name.toLowerCase().includes(emailServiceName.toLowerCase()) ||
        emailServiceName.toLowerCase().includes(s.name.toLowerCase())
    );
    setTargetServiceId(matchedService?.id ?? '');

    // Attempt auto-match for employee
    const emailEmployeeName = email.parsed_data?.employeeName ?? '';
    const matchedEmployee = employees?.find((e) => {
      const fullName = `${e.first_name} ${e.last_name}`.toLowerCase();
      return (
        fullName.includes(emailEmployeeName.toLowerCase()) ||
        emailEmployeeName.toLowerCase().includes(e.first_name.toLowerCase())
      );
    });
    setTargetEmployeeId(matchedEmployee?.id ?? '');
  };

  const getReasonBadge = (reason: PendingEmail['failure_reason']) => {
    switch (reason) {
      case 'service_not_found':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
            Usługa nie znaleziona
          </Badge>
        );
      case 'employee_not_found':
        return (
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
            Pracownik nie znaleziony
          </Badge>
        );
      case 'parse_failed':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
            Błąd parsowania
          </Badge>
        );
      default:
        return <Badge variant="secondary" className="text-xs">Inny</Badge>;
    }
  };

  const formatDate = (dateStr?: string, timeStr?: string) => {
    if (!dateStr) return '—';
    const combined = timeStr ? `${dateStr}T${timeStr}` : dateStr;
    try {
      return new Date(combined).toLocaleString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const pendingCount = pendingData?.count ?? 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Emaile do zaakceptowania
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs">
                  {pendingCount}
                </Badge>
              )}
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Wiadomości z Booksy, których nie udało się automatycznie przypisać do grafiku.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingPending ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !pendingData?.pending.length ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/20">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">Brak emaili oczekujących na akcję</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500">
                    <th className="pb-2 text-left font-medium pr-3">Data</th>
                    <th className="pb-2 text-left font-medium pr-3">Klient</th>
                    <th className="pb-2 text-left font-medium pr-3">Usługa (email)</th>
                    <th className="pb-2 text-left font-medium pr-3">Pracownik (email)</th>
                    <th className="pb-2 text-left font-medium pr-3">Powód błędu</th>
                    <th className="pb-2 text-right font-medium">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingData.pending.map((email) => (
                    <tr key={email.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2 pr-3 text-xs text-gray-600 whitespace-nowrap">
                        {formatDate(email.parsed_data?.bookingDate, email.parsed_data?.bookingTime)}
                      </td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-gray-900 text-xs">
                          {email.parsed_data?.clientName ?? '—'}
                        </p>
                        {email.parsed_data?.clientPhone && (
                          <p className="text-xs text-gray-400">{email.parsed_data.clientPhone}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-500 italic max-w-[150px] truncate">
                        {email.parsed_data?.serviceName ?? '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-500 italic max-w-[130px] truncate">
                        {email.parsed_data?.employeeName ?? '—'}
                      </td>
                      <td className="py-2 pr-3">{getReasonBadge(email.failure_reason)}</td>
                      <td className="py-2 text-right whitespace-nowrap space-x-1.5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 gap-1 text-xs px-2.5"
                                  disabled={email.failure_reason === 'parse_failed'}
                                  onClick={() => handleOpenAssign(email)}
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  Przypisz
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {email.failure_reason === 'parse_failed' && (
                              <TooltipContent>
                                <p>Email nie mógł być sparsowany</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => ignoreMutation.mutate(email.id)}
                          disabled={ignoreMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Ignoruj
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Ręczne przypisanie rezerwacji
            </DialogTitle>
          </DialogHeader>

          {selectedEmail && (
            <div className="space-y-5 py-2">
              {/* Read-only info */}
              <div className="grid grid-cols-2 gap-3 bg-muted/40 p-4 rounded-lg text-sm">
                <div className="space-y-0.5">
                  <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    <User className="h-3 w-3" /> Klient
                  </span>
                  <p className="font-medium text-sm">
                    {selectedEmail.parsed_data?.clientName ?? 'Brak danych'}
                  </p>
                  {selectedEmail.parsed_data?.clientPhone && (
                    <p className="text-xs text-muted-foreground">
                      {selectedEmail.parsed_data.clientPhone}
                    </p>
                  )}
                </div>
                <div className="space-y-0.5">
                  <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    <Calendar className="h-3 w-3" /> Data wizyty
                  </span>
                  <p className="font-medium text-sm">
                    {formatDate(
                      selectedEmail.parsed_data?.bookingDate,
                      selectedEmail.parsed_data?.bookingTime
                    )}
                  </p>
                </div>
                <div className="space-y-0.5 col-span-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Oryginalna usługa
                  </span>
                  <p className="text-xs italic text-muted-foreground">
                    {selectedEmail.parsed_data?.serviceName ?? '—'}
                  </p>
                </div>
                <div className="space-y-0.5 col-span-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Oryginalny pracownik
                  </span>
                  <p className="text-xs italic text-muted-foreground">
                    {selectedEmail.parsed_data?.employeeName ?? '—'}
                  </p>
                </div>
              </div>

              {/* Selects */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Usługa</label>
                  <Select value={targetServiceId} onValueChange={setTargetServiceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz usługę..." />
                    </SelectTrigger>
                    <SelectContent>
                      {services?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} — {s.price} zł
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Pracownik</label>
                  <Select value={targetEmployeeId} onValueChange={setTargetEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz pracownika..." />
                    </SelectTrigger>
                    <SelectContent>
                      {employees?.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.first_name} {e.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setSelectedEmail(null)}>
                  Anuluj
                </Button>
                <Button
                  onClick={() =>
                    assignMutation.mutate({
                      id: selectedEmail.id,
                      serviceId: targetServiceId,
                      employeeId: targetEmployeeId,
                    })
                  }
                  disabled={!targetServiceId || !targetEmployeeId || assignMutation.isPending}
                >
                  {assignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Utwórz rezerwację
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
