# SimpliSalon Quick Start

Ten dokument pomaga uruchomic salon w SimpliSalon bez wchodzenia od razu w wszystkie zaawansowane funkcje. Zaklada, ze zaczynasz jako wlasciciel salonu i chcesz przygotowac system do codziennej pracy.

## Dla kogo jest ten dokument

- dla wlasciciela salonu
- dla managera wdrazajacego zespol
- dla osoby, ktora chce skonfigurowac system w pierwsze 30-60 minut

## Zanim zaczniesz

Przygotuj:

- nazwe salonu
- adres e-mail wlasciciela konta
- podstawowe dane kontaktowe salonu
- liste uslug z cenami i czasem trwania
- liste pracownikow
- godziny otwarcia
- jesli korzystasz z Booksy: konto Gmail, do ktorego trafiaja wiadomosci z Booksy

## 1. Utworz konto salonu

Na ekranie rejestracji uzupelnij:

- imie i nazwisko
- e-mail
- haslo
- nazwe salonu
- adres URL salonu

Adres URL salonu jest tworzony na bazie nazwy, ale mozesz go edytowac. Po rejestracji system prosi o potwierdzenie adresu e-mail. Po aktywacji zaloguj sie do panelu.

## 2. Uzupelnij podstawowe ustawienia salonu

Przejdz do `Ustawienia -> Informacje o biznesie`.

Na start uzupelnij:

- typ dzialalnosci
- opis salonu
- e-mail kontaktowy
- e-mail do rozliczen
- telefon
- adres
- godziny otwarcia

W tym samym obszarze mozesz tez ustawic tekst lub link do regulaminu salonu. To przyda sie pozniej przy publicznej rezerwacji.

Wazne:

- pracownik nie ma dostepu do ustawien
- ustawienia sa przeznaczone dla wlasciciela i managera

## 3. Dodaj uslugi

Przejdz do `Uslugi`.

Dla kazdej uslugi ustaw przynajmniej:

- nazwe
- cene
- czas trwania
- status aktywnosci

W kolejnych etapach mozesz rozbudowac uslugi o:

- opisy
- dodatki
- zdjecia
- szablony dodatkow

Jesli masz wieksza baze uslug, sprawdz tez `Ustawienia -> Import danych`, gdzie dostepny jest import uslug z CSV.

## 4. Dodaj pracownikow i przypisz im uslugi

Przejdz do `Pracownicy`.

Na start wykonaj dla kazdej osoby:

- dodaj profil pracownika
- ustaw status aktywnosci
- przypisz uslugi, ktore moze wykonywac
- uzupelnij grafik

To bardzo wazny krok. Z kodu aplikacji wynika, ze pracownicy bez ustawionego grafiku nie beda widoczni w flow rezerwacji.

## 5. Sprawdz kalendarz i utworz pierwsza wizyte

Przejdz do `Kalendarz` albo `Rezerwacje`.

Najprostszy test wdrozenia:

1. Dodaj klienta.
2. Otworz nowa wizyte.
3. Wybierz usluge, pracownika i termin.
4. Zapisz rezerwacje.
5. Sprawdz, czy pojawila sie w kalendarzu.

Po tym kroku od razu widzisz, czy poprawnie dzialaja:

- uslugi
- pracownicy
- grafik
- baza klientow
- podstawowy obieg rezerwacji

## 6. Naucz sie pracy na ekranie glownym

`Dashboard` pokazuje najwazniejsze dane operacyjne:

- dzisiejsze wizyty
- przychod dzisiaj
- liczbe aktywnych pracownikow
- wielkosc bazy klientow
- liste najblizszych wizyt
- widget statusu Booksy

To jest najlepszy ekran do codziennego startu dnia. Z tego miejsca szybko przejdziesz do:

- klientow
- zespolu
- kalendarza
- ustawien

## 7. Podlacz Booksy

Jesli korzystasz z Booksy, potraktuj to jako osobny krok wdrozenia. Modul `Booksy` jest widoczny jako osobna pozycja w menu i jest przeznaczony dla wlasciciela salonu.

Przejdz do `Booksy` i wykonaj te kroki:

1. Dodaj skrzynke Gmail przez przycisk dodania skrzynki.
2. Po autoryzacji sprawdz, czy skrzynka jest aktywna.
3. Otworz sekcje `Ustawienia synchronizacji`.
4. Ustaw adres nadawcy Booksy.
5. Ustaw date, od ktorej system ma pobierac wiadomosci.
6. Ustaw interwal synchronizacji.
7. Zdecyduj, czy system ma automatycznie tworzyc klientow z Booksy.
8. Zdecyduj, czy system ma automatycznie tworzyc uslugi z Booksy.

W praktyce najbezpieczniejszy start to:

- wlaczyc automatyczne tworzenie klientow
- ostroznie podejsc do automatycznego tworzenia uslug, jesli masz juz uporzadkowany katalog uslug

Na ekranie Booksy dostaniesz tez kilka widokow operacyjnych:

- `Skrzynki i status integracji`
- `Ustawienia synchronizacji`
- `Kolejka obslugi i aktywnosc maili`
- `Ostatnie rezerwacje z Booksy`

Na co patrzec po podlaczeniu:

- liczba aktywnych skrzynek
- czas ostatniej synchronizacji
- status integracji
- kolejka wpisow wymagajacych obslugi recznej

Jesli jakas rezerwacja nie zostanie poprawnie rozpoznana, trafia do kolejki. Wtedy mozesz:

- przypisac odpowiednia usluge
- przypisac pracownika
- zatwierdzic wpis
- zignorowac wpis, jesli nie powinien trafic do grafiku

Na `Dashboardzie` jest tez widget Booksy, ktory pokazuje:

- czy integracja jest aktywna
- kiedy byla ostatnia synchronizacja
- ile dzisiaj bylo rezerwacji z Booksy
- czy cos czeka w kolejce do recznej obslugi

## 8. Skonfiguruj komunikacje i platnosci

Przejdz do `Ustawienia -> Integracje`.

Na start warto sprawdzic:

- `SMSAPI`, jesli chcesz wysylac SMS-y
- `Gmail - wysylanie e-maili`
- `Resend`, jesli chcesz wysylac e-maile z wlasnej domeny
- `Przelewy24`, jesli chcesz uruchomic platnosci online

To nie jest wymagane do pierwszego dnia pracy, ale warto to zrobic przed uruchomieniem przypomnien, CRM i platnosci linkiem.

## 9. Dodaj formularze, jesli prowadzisz wizyty wymagajace zgody lub wywiadu

Przejdz do `Formularze`.

System obsluguje:

- szablony formularzy
- zgloszenia i odpowiedzi klientow
- formularze przed wizyta
- bardziej rozbudowane karty zabiegowe

Ten krok jest szczegolnie wazny dla salonow beauty, wellness i uslug wymagajacych zgody klienta lub zebrania danych zdrowotnych.

## 10. Co skonfigurowac pozniej

Gdy podstawy dzialaja, przejdz do kolejnych modulow:

- `Klienci` i `CRM`
- `Raporty`
- `Vouchery`
- `Wynagrodzenia`
- `Subskrypcja`
- `Wyglad`
- `Powiadomienia`
- `Ankiety po wizycie`

## Pierwsza lista kontrolna

Jesli chcesz sprawdzic, czy wdrozenie podstawowe jest gotowe, przejdz te liste:

- [ ] konto wlasciciela zalozone i zweryfikowane
- [ ] dane salonu uzupelnione
- [ ] godziny otwarcia zapisane
- [ ] uslugi dodane
- [ ] pracownicy dodani
- [ ] pracownikom przypisano uslugi
- [ ] grafik pracownikow ustawiony
- [ ] pierwszy klient dodany
- [ ] pierwsza rezerwacja zapisana
- [ ] kalendarz pokazuje poprawne wizyty
- [ ] Booksy podlaczone, jesli salon z niego korzysta
- [ ] kolejka Booksy jest pusta albo przejrzana

## Uwagi do tej wersji

Ten Quick Start powstal na podstawie aktualnego kodu i struktury repozytorium. Obejmuje realnie widoczne moduly i przeplywy, ale nie zastepuje jeszcze pelnej instrukcji ekran po ekranie ze screenshotami.

Dobry kolejny krok to rozwiniecie tego dokumentu do wersji rolowej:

- Quick Start dla wlasciciela
- Quick Start dla managera
- Quick Start dla pracownika
- instrukcja Booksy krok po kroku
