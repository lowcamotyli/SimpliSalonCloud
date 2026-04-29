# Interactive Objects + Related Actions - Implementation Brief

## Odbiorca

Ten dokument jest dla Claude Code jako brief implementacyjny.

Claude Design przygotowal juz wzorce UI. Nie projektowac ich od nowa. Zadaniem implementacji jest przeniesienie gotowych komponentow i zachowan do aplikacji SimpliSalon.

## Cel zmiany

W calym UI obiekty biznesowe maja stac sie interaktywne:

- klient / klientka,
- pracownik,
- usluga,
- rezerwacja / wizyta,
- salon / lokalizacja.

Uzytkownik ma moc kliknac nazwe lub avatar obiektu, aby przejsc do szczegolow, albo otworzyc szybkie akcje kontekstowe bez przechodzenia na profil. Najwazniejszy przypadek to booking row: karta lub wiersz rezerwacji nadal otwiera szczegoly wizyty, ale powiazane obiekty w srodku maja wlasna nawigacje i wlasne menu akcji.

## Gotowe materialy od Claude Design

Claude Code ma korzystac z tych plikow jako zrodla prawdy:

- `SimpliSalon Design System/revamp/interactive-objects.html`
- `SimpliSalon Design System/revamp/tokens-v3.css`
- `SimpliSalon Design System/revamp/revamp.html`

W `interactive-objects.html` gotowa jest sekcja `09 Interactive Objects + Related Actions`:

- `09.0` zasady, typy obiektow, trzy strefy klikalne,
- `09.1` `ObjectLink`,
- `09.2` `ObjectPill`,
- `09.3` object row inside booking card,
- `09.4` `RelatedActions` dropdown,
- `09.5` rich object preview popover,
- `09.6` table cell object variant,
- `09.7` mobile variant z bottom action sheet,
- `09.8` spec zachowania, keyboard, ARIA, stany i tokeny.

W `revamp.html` gotowa jest sekcja `08 Pelny dashboard`, w tym topnav i global search input. Nie tworzyc nowego app shell od zera. Search z sekcji 08 ma zostac rozszerzony o wyniki obiektowe oparte na komponentach z sekcji 09.

## Zakres implementacji

### 1. Primitives

Zaimplementowac wspolne primitive/componenty dla obiektow:

- `ObjectLink` - klikalna nazwa obiektu, opcjonalnie z dot/ikona.
- `ObjectPill` - kompaktowy obiekt do ciasnych layoutow.
- `ObjectAvatar` / `ObjectDot` - wizualny identyfikator typu.
- `ObjectTrigger` - maly trigger `...` albo chevron dla related actions.
- `RelatedActionsMenu` - desktop dropdown.
- `RelatedActionsSheet` - mobile bottom sheet.
- `ObjectPreview` - rich preview popover, jesli aplikacja ma juz mechanizm popoverow.

Nie wymyslac nowej palety. Typy obiektow maja dziedziczyc logike z `interactive-objects.html` i tokenow v3.

### 2. Typy obiektow

Obslugiwane typy w pierwszej implementacji:

- `client`
- `worker`
- `service`
- `booking`
- `salon` / `location`

Kazdy typ musi miec:

- kolor typu,
- avatar/dot/icon fallback,
- route do szczegolow,
- liste related actions,
- stany default, hover, focus, open, disabled, loading, missing.

### 3. Booking row / booking card

W booking row rozdzielic trzy strefy klikniecia:

- klik w puste tlo, czas, status, cene lub glowne body wizyty otwiera szczegoly rezerwacji,
- klik w nazwe/avatar klienta, pracownika albo uslugi prowadzi do strony tego obiektu,
- klik w trigger `...` / chevron otwiera related actions i zawsze zatrzymuje propagacje.

Wymagane:

- `stopPropagation` dla linkow obiektowych i triggerow,
- brak konfliktu pomiedzy kliknieciem wiersza i kliknieciem obiektu,
- long label nie moze rozpychac wiersza,
- status i cena maja pozostac czytelne,
- destructive/conflict state dla rezerwacji ma byc widoczny, ale nie moze niszczyc kontrastu.

### 4. Related actions

Desktop:

- menu otwierane z triggera `...` albo chevrona,
- header z avatarem/ikona, nazwa i meta obiektu,
- grupowanie akcji separatorami,
- primary action jako pierwsza,
- destructive action na koncu,
- disabled i loading states.

Mobile:

- bottom sheet albo szeroki popover zgodny z wzorcem `09.7`,
- hit targety minimum 44 px,
- brak zaleznosci od hovera.

Keyboard/a11y:

- trigger ma `aria-haspopup="menu"` i `aria-expanded`,
- `Esc` zamyka menu i oddaje focus triggerowi,
- `ArrowUp` / `ArrowDown` nawiguje po akcjach,
- `Enter` aktywuje akcje,
- missing object ma `aria-disabled="true"` i nie powinien byc fokusowalnym linkiem.

### 5. Global search

Search input juz istnieje w sekcji 08 `revamp.html`. Implementacja ma rozszerzyc go o wyniki obiektowe.

Wyniki searcha:

- grupowane po typach: klientki, rezerwacje, uslugi, pracownicy, ustawienia,
- kazdy wynik pokazuje typ, nazwe, meta tekst i opcjonalne quick actions,
- wynik korzysta z tych samych primitive co reszta UI: `ObjectAvatar`, `ObjectLink`, `ObjectPill`, `ObjectTrigger`,
- klik w wynik otwiera obiekt,
- klik w related action wyniku nie moze otworzyc calego wyniku,
- `Enter` otwiera aktywny wynik,
- strzalki gora/dol zmieniaja aktywny wynik,
- `Esc` zamyka panel wynikow.

Nie zmieniac wygladu topnavu bez potrzeby. Topnav jest baza z sekcji 08; zmiana dotyczy panelu wynikow i zachowania searcha.

### 6. Table cells

W tabelach CRM/listach:

- avatar + nazwa + meta jako object cell,
- klik w avatar/nazwe prowadzi do profilu,
- akcje po prawej stronie komorki albo w osobnej stalej kolumnie,
- row hover nie moze ukrywac focus state obiektu,
- dlugie nazwy maja ellipsis.

## Related actions per type

### Client

- Otworz profil
- Zadzwon
- Wyslij SMS
- Wyslij email
- Utworz rezerwacje
- Dodaj notatke
- Pokaz historie wizyt
- Oznacz jako VIP / usun VIP

### Worker

- Otworz profil
- Pokaz grafik
- Dodaj nieobecnosc
- Wyslij wiadomosc
- Pokaz dzisiejsze wizyty
- Przypisz usluge

### Service

- Otworz szczegoly
- Edytuj usluge
- Pokaz pracownikow
- Dodaj do rezerwacji
- Wlacz / wylacz online booking

### Booking

- Otworz szczegoly
- Przeloz / zmien termin
- Potwierdz
- Anuluj
- Wyslij przypomnienie
- Przyjmij platnosc
- Dodaj notatke

### Salon / Location

- Otworz lokalizacje
- Pokaz godziny otwarcia
- Przypisz pracownika
- Pokaz kalendarz lokalizacji
- Edytuj dane salonu

### Missing object

- Przypisz istniejacy
- Utworz nowy, jesli kontekst na to pozwala
- Zglos brak danych
- Usun powiazanie, tylko jesli uzytkownik ma uprawnienia

## Stany do zaimplementowania

- default,
- hover,
- keyboard focus,
- active / pressed,
- menu open,
- disabled,
- loading,
- destructive,
- missing object,
- permission denied,
- long label / overflow,
- mobile narrow width.

## Acceptance criteria

- Obiekty `client`, `worker`, `service`, `booking`, `salon/location` sa rozpoznawalne wizualnie i klikalne.
- Nazwa/avatar obiektu prowadzi do szczegolow obiektu.
- Trigger akcji otwiera related actions i nie propaguje klikniecia do parent row.
- Booking row nie ma konfliktu klikniec miedzy wierszem, obiektami i menu.
- Related actions sa dostepne bez przechodzenia na profil.
- Search z sekcji 08 pokazuje wyniki jako obiekty i wspiera szybka nawigacje klawiatura.
- Dlugie nazwy nie psuja layoutu.
- Desktop i mobile maja odpowiednie warianty.
- Focus state jest widoczny i zgodny z tokenami v3.
- Nie wprowadzono nowej palety kolorow.

## Verification dla Claude Code

Po implementacji zwrocic evidence:

- lista zmienionych plikow,
- komendy uruchomione i wynik,
- zrzut lub opis recznej weryfikacji UI, jesli automatyczna weryfikacja nie jest dostepna,
- otwarte ryzyka albo elementy, ktorych nie dalo sie sprawdzic.

Minimalna weryfikacja:

- typecheck/lint zgodnie z projektem,
- test klikniecia booking row vs object link vs action trigger,
- test keyboard dla menu: `Tab`, `Enter`, `ArrowUp`, `ArrowDown`, `Esc`,
- test search panelu: aktywny wynik, `Enter`, `Esc`, click w quick action,
- test mobile/small viewport dla bottom sheet i long labels.
