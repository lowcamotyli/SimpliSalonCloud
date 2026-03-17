import type { FieldType } from '../../types/forms.ts'

export interface FieldMapEntry {
  id: string
  type: FieldType
  labelPatterns: string[]
  options?: string[]
  required: boolean
  isHealthField: boolean
  isSensitiveField: boolean
}

export const FIELD_MAP: FieldMapEntry[] = [
  { id: "full_name", type: "text", labelPatterns: ["imie i nazwisko","imie","nazwisko","pelne imie"], required: true, isHealthField: false, isSensitiveField: false },
  { id: "birthday", type: "date", labelPatterns: ["data urodzenia","urodzenia","rok urodzenia","birth","urodzin"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "phone", type: "text", labelPatterns: ["telefon","numer telefonu","kontaktowy","phone","tel"], required: true, isHealthField: false, isSensitiveField: false },
  { id: "email", type: "text", labelPatterns: ["e-mail","email","adres email","adres e-mail"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "service_type", type: "select", labelPatterns: ["rodzaj uslugi","jaki rodzaj uslugi","jaka usluga","rodzaj zabiegu","interesuje podczas"], options: ["Strzyżenie damskie","Strzyżenie męskie","Strzyżenie dziecięce","Koloryzacja (jednolita)","Refleksy / pasemka","Dekoloryzacja","Tonowanie","Keratynowe prostowanie","Kuracja regeneracyjna","Stylizacja","Inne"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "hair_color_treated", type: "radio", labelPatterns: ["farbowane wlosy","farbowane wlosy","czy farbowal","farbowanie"], options: ["Tak","Nie"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "hair_dye_location", type: "radio", labelPatterns: ["gdzie wykonano koloryzacje","gdzie farbowal","miejsce koloryzacji"], options: ["W salonie","Samodzielnie w domu","Nie pamietam"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "hair_dye_product", type: "radio", labelPatterns: ["jakimi produktami","produkty do koloryzacji","czym farbowal"], options: ["Profesjonalnymi","Drogeryjnymi","Nie wiem"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "hair_dye_when", type: "radio", labelPatterns: ["kiedy ostatnio koloryzacja","kiedy ostatnio farbowal"], options: ["mniej niz miesiac","1-3 miesiace","3-6 miesiecy","Ponad 6 miesiecy","Nigdy"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "heat_styling_frequency", type: "radio", labelPatterns: ["jak czesto stylizuje","cieple","suszarka","prostownica","lokuwka"], options: ["Codziennie","Kilka razy w tygodniu","Rzadko","Nigdy"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "hair_condition", type: "radio", labelPatterns: ["kondycja wlosow","ocenia pan","kondycje swoich wlosow"], options: ["Bardzo dobra","Dobra","Do poprawy","Zla","Trudno ocenic"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "hair_problems", type: "select", labelPatterns: ["problemy z wlosami","problemy ze skora glowy","wypadanie","lupie","rozdwojone"], options: ["Brak problemow","Wypadanie wlosow","Przetluszczanie","Suchosc","Lupie","Podraznienie skory glowy","Rozdwojone konczyki","Inne"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "hair_wash_frequency", type: "radio", labelPatterns: ["jak czesto myje","mycie wlosow"], options: ["Codziennie","Co 2 dni","2-3 razy w tygodniu","1 raz w tygodniu lub rzadziej"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "hair_cosmetics", type: "select", labelPatterns: ["kosmetyki do pielegnacji","jakich kosmetykow","szampon","odzywka"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "service_expectation", type: "select", labelPatterns: ["efektu oczekuje","oczekiwany efekt","cel zabiegu","cel wizyty","jakiego efektu"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "skin_type", type: "radio", labelPatterns: ["typ skory","rodzaj skory","cera"], options: ["Normalna","Sucha","Tlusty","Mieszana","Wrazliwa"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "skin_conditions", type: "select", labelPatterns: ["dolegliwosci skory","zmiany skorne","stan skory","choroby skorne"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "allergies", type: "radio", labelPatterns: ["uczulony","uczulona","alergia","reakcja alergiczna","alerg","na cos uczulony"], options: ["Tak","Nie"], required: false, isHealthField: true, isSensitiveField: false },
  { id: "allergy_details", type: "textarea", labelPatterns: ["na co uczulona","na co uczulony","co wywoluje alergie","jakie alergeny","objawy alergii","czym sie objawiala","na co"], required: false, isHealthField: true, isSensitiveField: false },
  { id: "medications", type: "radio", labelPatterns: ["leki na stale","przyjmuje leki","przyjmuje pan leki","przyjmuje jakies leki"], options: ["Tak","Nie"], required: false, isHealthField: true, isSensitiveField: false },
  { id: "medication_details", type: "textarea", labelPatterns: ["jakie leki","nazwa leku","dawka leku","ktore leki","podanie dokladnej nazwy"], required: false, isHealthField: true, isSensitiveField: false },
  { id: "pregnancy", type: "radio", labelPatterns: ["ciaza","w ciazy","czy jest pani w ciazy"], options: ["Tak","Nie","Nie dotyczy"], required: false, isHealthField: true, isSensitiveField: false },
  { id: "breastfeeding", type: "radio", labelPatterns: ["karmi piersia","karmienie piersia"], options: ["Tak","Nie","Nie dotyczy"], required: false, isHealthField: true, isSensitiveField: false },
  { id: "contraceptives", type: "radio", labelPatterns: ["antykoncepcja","srodki antykoncepcyjne","doustna antykoncepcja","doustne srodki"], options: ["Tak","Nie","Nie dotyczy"], required: false, isHealthField: true, isSensitiveField: false },
  { id: "chronic_diseases", type: "radio", labelPatterns: ["choroby przewlekle","choruje przewlekle","cierpi na","schorzenia","aktualnie sie pan","na cos leczy"], options: ["Tak","Nie"], required: false, isHealthField: true, isSensitiveField: true },
  { id: "disease_details", type: "textarea", labelPatterns: ["jakie choroby","konkretne schorzenie","na co choruje","ktore choroby","opisz chorobe"], required: false, isHealthField: true, isSensitiveField: true },
  { id: "cancer_history", type: "radio", labelPatterns: ["nowotw","rak","onkolog","chemioter"], options: ["Tak","Nie"], required: false, isHealthField: true, isSensitiveField: true },
  { id: "pacemaker", type: "radio", labelPatterns: ["rozrusznik","rozrusznik serca","metalowe implanty","implant"], options: ["Tak","Nie"], required: false, isHealthField: true, isSensitiveField: true },
  { id: "blood_coagulation", type: "radio", labelPatterns: ["sklonnosc do krwawien","krzepliwosc krwi","leki przeciwzakrzepowe","aspiryna","antykoagulanty","krzepn"], options: ["Tak","Nie"], required: false, isHealthField: true, isSensitiveField: true },
  { id: "fainting_history", type: "radio", labelPatterns: ["zaslabniecie","utrata przytomnosci","omdlenie","epizody zaslabniecia"], options: ["Tak","Nie"], required: false, isHealthField: true, isSensitiveField: false },
  { id: "herpes", type: "radio", labelPatterns: ["opryszczka","herpes"], options: ["Tak","Nie"], required: false, isHealthField: true, isSensitiveField: false },
  { id: "sunscreen_use", type: "radio", labelPatterns: ["ochrona przeciwsloneczna","krem z filtrem","filtr spf","spf"], options: ["Tak codziennie","Tak raz dziennie","Tak latem","Sporadycznie","Nie"], required: false, isHealthField: false, isSensitiveField: false },
  { id: "gdpr_consent", type: "checkbox", labelPatterns: ["zgoda rodo","klauzula","zgoda na przetwarzanie danych","przetwarzanie danych osobowych"], required: true, isHealthField: false, isSensitiveField: false },
  { id: "health_consent", type: "checkbox", labelPatterns: ["zgoda na przetwarzanie danych zdrowotnych","dane o stanie zdrowia","zgoda zdrowotna","wyrazam zgode na zabieg","zgoda na zabieg"], required: true, isHealthField: true, isSensitiveField: false },
  { id: "signature", type: "signature", labelPatterns: ["podpis","signature","zloz podpis"], required: true, isHealthField: false, isSensitiveField: false },
]
