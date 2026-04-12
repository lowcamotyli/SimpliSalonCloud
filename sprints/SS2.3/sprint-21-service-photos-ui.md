# Sprint SS2.2-21 — Service Photos / Gallery: UI (Admin + Public)

## Cel
(P1) Dwa frontendy dla zdjęć usług:
1. **Panel admina**: upload i zarządzanie galerią przy usłudze.
2. **Public booking**: wyświetlanie zdjęć przy wyborze usługi.

## Architektura — dokumenty referencyjne

Brak nowych tabel — czysto UI. API z sprint-20.

**Kluczowe constraints:**
- Upload: `<input type="file" accept="image/*">` + fetch do `/api/services/[id]/media`
- Bez zewnętrznych bibliotek do drag-and-drop (etap 1 — prosta kolejność przez kliknięcie)
- Public display: lazy loading obrazków, `<img>` z `loading="lazy"`, proper `alt`
- Max 5 zdjęć → po osiągnięciu limitu przycisk "Dodaj" disabled

## Zakres tego sprintu

### A — Panel: galeria w formularzu usługi
- [ ] `components/services/service-media-gallery.tsx`:
  - Grid miniatur (max 5)
  - Każda miniatura: podgląd + przycisk X (usuń)
  - Przycisk "Dodaj zdjęcie" → file picker → upload → optimistic UI
  - Loading spinner podczas uploadu
  - Error toast jeśli plik za duży lub zły format
  - Brak drag-and-drop (etap 1) — kolejność = porządek dodawania
- [ ] Integracja z `components/services/service-form.tsx` — zakładka lub sekcja "Galeria"

### B — Public booking: wyświetlanie galerii
- [ ] Przy liście usług w public booking:
  - Jeśli usługa ma zdjęcia: pierwsze zdjęcie jako miniatura obok nazwy
  - Kliknięcie → modal z pełną galerią (lub Carousel)
- [ ] `components/public-booking/service-gallery-modal.tsx`:
  - Dialog z wyświetlaniem zdjęć
  - Nawigacja poprzednie/następne
  - alt text dla każdego zdjęcia
  - Zamknij przyciskiem lub Escape

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `components/services/service-media-gallery.tsx` | CREATE | codex-main |
| `components/services/service-form.tsx` | EDIT — integracja galerii | codex-main |
| `components/public-booking/service-gallery-modal.tsx` | CREATE | codex-dad |
| `app/booking/[slug]/components/service-selector.tsx` | EDIT — miniatura + gallery link | codex-dad |

## Zależności
- **Wymaga:** sprint-20 (API zdjęć usług), sprint-18 (service descriptions — renderowane razem)
- **Blokuje:** nic (public trust layer gotowy)

---

## Prompt — codex-main (ServiceMediaGallery + integracja)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read components/services/service-form.tsx for context. Do NOT use Gemini — write directly.

Goal 1: Create components/services/service-media-gallery.tsx
Props: { serviceId: string }
- On mount: fetch GET /api/services/[serviceId]/media
- Display grid of thumbnails (max 5): each shows <img> + delete button (X)
- "Dodaj zdjęcie" button: <input type="file" accept="image/jpeg,image/png,image/webp"> hidden, triggered by button click
  - On file select: validate size ≤ 2MB, then POST to /api/services/[serviceId]/media as FormData
  - During upload: show spinner on the slot
  - On success: add new image to grid
  - On error: show error toast
- Disable "Dodaj" when 5 photos already exist

Goal 2: Integrate into service-form.tsx
- Add "Galeria" section below existing fields
- Render <ServiceMediaGallery serviceId={serviceId} /> — only when editing existing service (not during create, serviceId must exist)

Use shadcn/ui: Button, Card. Done when: tsc clean'
```

---

## Prompt — codex-dad (public gallery)

```bash
DAD_PROMPT='Read app/booking/[slug]/components/service-selector.tsx for context.
Goal: Add photo display to public booking service selection.

File 1: /mnt/d/SimpliSalonCLoud/components/public-booking/service-gallery-modal.tsx
Props: { images: Array<{ public_url: string, alt_text?: string }>, serviceName: string, open: boolean, onClose: () => void }
- shadcn/ui Dialog with carousel-like navigation (previous/next buttons, image counter "2/5")
- Each image: <img src={public_url} alt={alt_text || serviceName} loading="lazy" />
- Close button + keyboard Escape
- If only 1 image: hide navigation buttons

File 2: Edit app/booking/[slug]/components/service-selector.tsx
- If service has images (images.length > 0): show first image as 40x40 thumbnail next to service name
- Add small "Galeria (N)" link/button that opens ServiceGalleryModal
- Fetch service images from GET /api/services/[id]/media or include in service data if already fetched

Done when: tsc clean' bash ~/.claude/scripts/dad-exec.sh
```

---

## Weryfikacja po sprincie
```bash
npx tsc --noEmit
# Panel: edytuj usługę → sekcja Galeria → dodaj zdjęcie → pojawia się miniatura
# Public flow: wybierz usługę ze zdjęciem → miniatura widoczna → kliknij → modal otwiera się
```
