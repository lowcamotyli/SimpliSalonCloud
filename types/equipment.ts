export interface Equipment {
  id: string;
  salon_id: string;
  name: string;
  type: "laser" | "fotel" | "stol_manicure" | "fotopolimeryzator" | "inne" | "other";
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface EquipmentBooking {
  id: string;
  booking_id: string;
  equipment_id: string;
  starts_at: string;
  ends_at: string;
}

export interface AvailabilityResult {
  equipment_id: string;
  is_available: boolean;
  conflict_booking_id?: string;
}

export const EQUIPMENT_TYPES: { value: Equipment["type"]; label: string }[] = [
  { value: "laser", label: "Laser" },
  { value: "fotel", label: "Fotel" },
  { value: "stol_manicure", label: "Stol do manicure" },
  { value: "fotopolimeryzator", label: "Fotopolimeryzator" },
  { value: "inne", label: "Inne" },
  { value: "other", label: "Other" },
];
