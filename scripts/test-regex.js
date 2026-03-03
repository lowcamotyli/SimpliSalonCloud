const text = `
Katarzyna Barabasz przesunął swoją wizytę Sombre komplet włosy
średnie z dnia czwartek, 23 października 2025 10:45 na inny termin.

Ponieważ masz ustawiony kalendarz w tryb manualny klient czeka na
potwierdzenie nowego terminu.

Możesz potwierdzić ten termin za pomocą:
- strony internetowej biz.booksy.com
- aplikacji na telefonie: sprawdź zakładkę „Tablica”, znajdź klienta i potwierdź lub odrzuć
  nowy termin wizyty

Po potwierdzeniu poprzedni termin wizyty będzie uwolniony i będzie
ponownie czekać na rezerwację innego klienta.

Katarzyna Barabasz
698 358 007
kasiabarabasz1@gmail.com

czwartek, 13 listopada 2025, 10:15 - 14:15

koloryzacja: Sombre komplet włosy średnie
300,00 zł+, 10:15 - 14:15
pracownik: Karolina
`;

const m = text.match(/(\d{1,2})\s+(.+?)\s+(\d{4}),\s+(\d{2}):(\d{2})\s*[-–—]\s*(\d{2}):(\d{2})/m);
console.log("Match:", m);
