KOMIS U BRATA — WERSJA PUBLICZNA (BAZA)

Zawartość:
- index.html       — strona publiczna Samochody
- samochody.html   — osobny adres do działu Samochody
- motocykle.html   — strona publiczna Motocykle
- inne.html        — strona publiczna Inne
- assets/scigacz.webp — tło działu Motocykle

Zmiany:
- każda strona otwiera się domyślnie w widoku klienta;
- usunięto przycisk „Wróć do panelu”;
- poprawiono odwołania do grafiki scigacz.webp.

WAŻNE:
To jest publiczna wersja bazowa przygotowana z przesłanej aplikacji.
Kod nadal odczytuje ogłoszenia z IndexedDB przeglądarki. Dane zapisane lokalnie
w Komis Panel nie będą automatycznie widoczne u innych klientów.
Przed publikacją produkcyjną należy podłączyć wspólne dane i zdjęcia przechowywane
w repozytorium oraz bezpieczny mechanizm publikowania. Samo ukrycie panelu
administracyjnego nie jest zabezpieczeniem — panel wymaga osobnego adresu
i prawdziwego uwierzytelniania.
