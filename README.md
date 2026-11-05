# Snajper

Własny, samodzielnie hostowany snajper do licytacji na Allegro — zamiennik snajper.net.
Działa jako serwer (Docker na Unraid) + panel w telefonie (PWA). Nie jest wystawiony
na świat — dostęp tylko z Twojej sieci VPN.

## Jak to działa

- Licytacja idzie przez **oficjalne REST API Allegro** (`PUT /bidding/offers/{offerId}/bid`),
  a nie przez symulowanie przeglądarki — to jest sanowany, zamierzony sposób użycia tego
  endpointu (dokumentacja Allegro opisuje go właśnie jako sposób na programowe składanie ofert).
- Logowanie do Allegro przez OAuth **Device Flow** — jednorazowo wklepujesz kod na
  allegro.pl, serwer sam odświeża token w tle.
- Czas zakończenia aukcji: Allegro blokuje zwykłe zapytania serwerowe do swoich stron
  (403 — ochrona przed botami, potwierdzone testem), więc serwer **nie** próbuje sam
  pobierać strony aukcji. Zamiast tego w panelu jest **bookmarklet** — przeciągasz go
  na pasek zakładek, a gdy jesteś na stronie aukcji w swojej zwykłej przeglądarce,
  jeden klik odczytuje czas końca i cenę wprost ze strony (z danych `schema.org`,
  pole `priceValidUntil`) i wysyła do panelu. To Twoja prawdziwa przeglądarka czyta
  już wczytaną stronę — nie ma w tym scrapowania ani automatyzacji logowania.
- Dane (tokeny, lista licytacji, historia) trzymane w jednym pliku `data/store.json`.

## Wdrożenie na Unraid

1. **Zarejestruj aplikację** na https://apps.developer.allegro.pl jako typ
   **"Aplikacja na urządzenie"** (device flow — bez redirect_uri). Potrzebne będzie
   konto Allegro z włączonym 2FA. Zapisz `Client ID` i `Client Secret`.
2. Skopiuj `.env.example` do `.env` i wypełnij `BOOKMARKLET_TOKEN` (losowy ciąg,
   np. `openssl rand -hex 24`) — to jedyna zmienna, którą trzeba ustawić przed
   startem.
3. Zbuduj i wystartuj:
   ```bash
   docker compose up -d --build
   ```
4. Otwórz panel (przez swój VPN) na `http://<ip-serwera>:3000` — **logowanie do
   panelu jest na razie wyłączone**, więc wchodzisz od razu (zobacz "Bezpieczeństwo"
   niżej).
5. W sekcji **„Ustawienia Allegro”** wklej `Client ID` i `Client Secret` z punktu 1
   i zapisz — działa od razu, bez restartu kontenera. Potem kliknij „Połącz z
   Allegro” i wpisz pokazany kod na allegro.pl.
6. Na telefonie: otwórz ten sam adres w przeglądarce (połączony z VPN-em) i dodaj do
   ekranu głównego — zadziała jak appka (PWA).
7. W panelu, w sekcji "Dodawanie jednym kliknięciem", przeciągnij link na pasek
   zakładek w przeglądarce, której używasz do przeglądania Allegro (desktop i/lub
   telefon). Od teraz: na stronie aukcji → klik w bookmarklet → podajesz max kwotę
   → gotowe, serwer sam strzeli w ustalonym momencie.

## Bezpieczeństwo

- Trzymaj to za VPN-em, nie wystawiaj portu na świat — appka ma dostęp do Twojego
  konta Allegro i możliwość wydawania pieniędzy.
- **Logowanie do panelu jest obecnie wyłączone** (na życzenie, dla prostoty) — każdy,
  kto ma dostęp do Twojej sieci VPN, może otworzyć panel i zmieniać licytacje. Kod
  logowania hasłem wciąż jest w repo (`backend/src/auth.ts`, `backend/src/routes/auth.ts`)
  i gotowy do włączenia z powrotem — wystarczy w `backend/src/index.ts` podmontować
  `authRouter` i dodać `requireAuth` na trasach `/api/allegro`, `/api/watches`,
  `/api/settings`, a w `.env` ustawić `SESSION_SECRET` i `PANEL_PASSWORD_HASH`
  (wygenerowany przez `node backend/scripts/hash-password.mjs "haslo"`).
- Plik `data/store.json` zawiera tokeny dostępu do Twojego konta Allegro — traktuj go
  jak hasło, nie commituj go do repo (jest w `.gitignore`).

## Rozwój lokalny

```bash
cd backend
npm install
npm run dev
```

Panel frontend jest serwowany bezpośrednio przez backend (katalog `frontend/`),
więc wystarczy jeden proces.
