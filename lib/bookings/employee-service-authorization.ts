type EmployeeServiceRow = {
  service_id: string | null
}

type EmployeeServiceQueryClient = {
  from: (table: 'employee_services') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => any
    }
  }
}

export async function canEmployeePerformService(
  supabase: EmployeeServiceQueryClient,
  salonId: string,
  employeeId: string,
  serviceId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('employee_services')
    .select('service_id')
    .eq('salon_id', salonId)
    .eq('employee_id', employeeId)

  if (error) throw error

  const assignedServices = (data ?? []) as EmployeeServiceRow[]

  if (assignedServices.length === 0) {
    return true
  }

  return assignedServices.some((row) => row.service_id === serviceId)
}
