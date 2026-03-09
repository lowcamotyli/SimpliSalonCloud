export interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  options?: string[];
  helpText?: string;
}

export interface FormTemplate {
  id: string;
  name: string;
  description?: string;
  fields: FormField[];
  requires_signature: boolean;
  gdpr_consent_text?: string;
  is_active: boolean;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Tekst' },
  { value: 'textarea', label: 'Długi tekst' },
  { value: 'checkbox', label: 'Checkboxes' },
  { value: 'radio', label: 'Radio' },
  { value: 'select', label: 'Lista' },
  { value: 'date', label: 'Data' },
  { value: 'signature', label: 'Podpis' },
  { value: 'section_header', label: 'Nagłówek sekcji' },
];

export const BUILTIN_TEMPLATES: Array<Omit<FormTemplate, 'id' | 'is_active'>> = [
  {
    name: 'Karta klienta',
    description: 'Podstawowe dane klienta i zgoda RODO.',
    requires_signature: true,
    gdpr_consent_text:
      'Wyrażam zgodę na przetwarzanie moich danych osobowych w celu realizacji usług i prowadzenia dokumentacji zabiegowej.',
    fields: [
      { id: 'full_name', type: 'text', label: 'Imię i nazwisko', required: true },
      { id: 'birthday', type: 'date', label: 'Data urodzenia', required: false },
      { id: 'phone', type: 'text', label: 'Telefon', required: true },
      { id: 'email', type: 'text', label: 'E-mail', required: false },
      { id: 'allergies', type: 'textarea', label: 'Alergie', required: false },
      { id: 'medications', type: 'textarea', label: 'Przyjmowane leki', required: false },
      {
        id: 'pregnancy_status',
        type: 'radio',
        label: 'Ciąża',
        required: true,
        options: ['Tak', 'Nie', 'Nie dotyczy'],
      },
    ],
  },
  {
    name: 'Karta zabiegowa — ciało',
    description: 'Wywiad przed zabiegiem na ciało.',
    requires_signature: true,
    gdpr_consent_text:
      'Potwierdzam prawdziwość podanych informacji i świadomość przeciwwskazań do zabiegu.',
    fields: [
      {
        id: 'current_treatment',
        type: 'radio',
        label: 'Czy jesteś obecnie w trakcie leczenia?',
        required: true,
        options: ['Tak', 'Nie']
      },
      { id: 'medications', type: 'textarea', label: 'Jakie leki aktualnie przyjmujesz?', required: false },
      { id: 'allergies', type: 'textarea', label: 'Czy masz alergie?', required: false },
      {
        id: 'skin_concerns',
        type: 'checkbox',
        label: 'Problemy skórne (ciało)',
        required: false,
        options: ['Rozstępy', 'Cellulit', 'Przesuszenie', 'Nadwrażliwość', 'Brak'],
      },
      { id: 'smoking', type: 'radio', label: 'Czy palisz papierosy?', required: true, options: ['Tak', 'Nie'] },
      { id: 'pregnancy', type: 'radio', label: 'Czy jesteś w ciąży?', required: true, options: ['Tak', 'Nie', 'Nie dotyczy'] },
      { id: 'breastfeeding', type: 'radio', label: 'Czy karmisz piersią?', required: true, options: ['Tak', 'Nie', 'Nie dotyczy'] },
      { id: 'pacemaker', type: 'radio', label: 'Czy masz rozrusznik serca?', required: true, options: ['Tak', 'Nie'] },
      { id: 'implants', type: 'radio', label: 'Czy masz implanty metalowe?', required: true, options: ['Tak', 'Nie'] },
      {
        id: 'contraindications_known',
        type: 'radio',
        label: 'Czy znasz przeciwwskazania do zabiegu?',
        required: true,
        options: ['Tak', 'Nie']
      },
      { id: 'additional_notes', type: 'textarea', label: 'Dodatkowe uwagi', required: false },
    ],
  },
  {
    name: 'Karta zabiegowa — twarz',
    description: 'Wywiad przed zabiegiem na twarz.',
    requires_signature: true,
    gdpr_consent_text:
      'Oświadczam, że podane dane są zgodne z prawdą i zostałem/am poinformowany/a o zaleceniach pozabiegowych.',
    fields: [
      {
        id: 'isotretinoin',
        type: 'radio',
        label: 'Czy stosujesz lub stosowałeś/aś izotretynoinę w ostatnich 6 miesiącach?',
        required: true,
        options: ['Tak', 'Nie']
      },
      {
        id: 'skin_type',
        type: 'checkbox',
        label: 'Typ skóry',
        required: true,
        options: ['Sucha', 'Tłusta', 'Mieszana', 'Wrażliwa', 'Naczynkowa'],
      },
      {
        id: 'skin_problems',
        type: 'checkbox',
        label: 'Problemy skórne',
        required: false,
        options: ['Trądzik', 'Przebarwienia', 'Rumień', 'Zmarszczki', 'Brak'],
      },
      { id: 'solarium', type: 'radio', label: 'Czy korzystasz z solarium?', required: true, options: ['Tak', 'Nie'] },
      { id: 'spf', type: 'radio', label: 'Czy stosujesz codziennie SPF?', required: true, options: ['Tak', 'Nie'] },
      {
        id: 'previous_treatments',
        type: 'textarea',
        label: 'Przebyte zabiegi kosmetyczne/medycyny estetycznej',
        required: false
      },
      { id: 'cosmetic_allergies', type: 'textarea', label: 'Alergie na kosmetyki/składniki', required: false },
      { id: 'pregnancy', type: 'radio', label: 'Ciąża/karmienie piersią', required: true, options: ['Tak', 'Nie', 'Nie dotyczy'] },
    ],
  },
  {
    name: 'Zgoda na zabieg — ogólna',
    description: 'Ogólna zgoda klienta na wykonanie zabiegu.',
    requires_signature: true,
    gdpr_consent_text:
      'Wyrażam świadomą zgodę na wykonanie zabiegu po zapoznaniu się z informacjami o przeciwwskazaniach i możliwych reakcjach.',
    fields: [
      { id: 'treatment_name', type: 'text', label: 'Nazwa zabiegu', required: true },
      {
        id: 'contraindications_read',
        type: 'radio',
        label: 'Potwierdzam, że zapoznałem/am się z przeciwwskazaniami',
        required: true,
        options: ['Tak', 'Nie']
      },
      {
        id: 'questions_answered',
        type: 'radio',
        label: 'Moje pytania zostały wyjaśnione',
        required: true,
        options: ['Tak', 'Nie']
      },
      { id: 'notes', type: 'textarea', label: 'Dodatkowe uwagi', required: false },
    ],
  },
];
export type BuiltinFormTemplate=Omit<FormTemplate,"id"|"is_active">;