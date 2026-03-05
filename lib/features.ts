export type FeatureFlag =
  | 'billing'
  | 'equipment'
  | 'medical_forms'
  | 'sms_chat'
  | 'blacklist'
  | 'surveys'

export function hasFeature(
  salonFeatures: Record<string, boolean> | null | undefined,
  feature: FeatureFlag
): boolean {
  return salonFeatures?.[feature] === true
}

// To activate a flag for a salon run:
// UPDATE salons SET features = features || '{"billing": true}' WHERE id = $salonId;
