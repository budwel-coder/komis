KOMIS U BRATA — PAKIET STRONY

Pliki:
- index.html       — podstrona Samochody (zachowana dotychczasowa wersja)
- motocykle.html   — oddzielna podstrona Motocykle
- inne.html        — oddzielna podstrona Inne
- assets/scigacz.webp — fotograficzne tło podstrony Motocykle

Wgraj wszystkie pliki i folder assets do tego samego repozytorium GitHub Pages.
Nie zmieniaj nazw plików ani położenia folderu assets.

Panel administratora:
- W panelu są osobne działy Samochody, Motocykle i Inne.
- W dziale Podstrony można zmieniać nazwy i włączać/wyłączać działy.
- Samochody zachowują dotychczasowe pola i wyposażenie z 35 checkboxami.
- Motocykle mają własny formularz z danymi podobnymi do samochodów.
- Inne ma tytuł, opcjonalną cenę, opis i zdjęcia.
- Każda kategoria ma oddzielne ogłoszenia i galerię.

WAŻNE O DANYCH:
Dane nadal są zapisywane lokalnie w przeglądarce (IndexedDB), tak jak w poprzedniej wersji. Aby przenieść dane między komputerami/przeglądarkami, używaj funkcji „Pobierz pełną kopię” i importu. Samo opublikowanie plików na GitHub Pages nie synchronizuje lokalnej bazy między urządzeniami.

Baza marek i modeli: formularz samochodu korzysta z osobnej bazy marek i modeli samochodowych, a formularz motocykla z niezależnej bazy marek i modeli motocyklowych. Listy nie mieszają się między kategoriami. Wpisywanie własnej marki/modelu nadal jest możliwe. Baza działa bez internetu.

NOWY ETAP — ODBIÓR OFERTY Z APLIKACJI ROBOCZEJ:
- netlify/functions/receive-commission.mjs — endpoint do bezpiecznego przyjęcia zdjęć i danych.
- data/komis.json — dane, które będą wyświetlane przez stronę publiczną po publikacji.
- szczegółowa instrukcja konfiguracji znajduje się w ODBIOR_KOMISU_NETLIFY.txt.
- przed pierwszym wdrożeniem wymagane jest skonfigurowanie zmiennych środowiskowych Netlify i wykonanie testu.


ODDZIELNE ADRESY:
- index.html, samochody.html, motocykle.html, inne.html — publiczne podstrony komisu.
- admin.html — osobny adres panelu administratora (lokalna baza IndexedDB).
Panel nie jest automatycznie synchronizowany między urządzeniami.
