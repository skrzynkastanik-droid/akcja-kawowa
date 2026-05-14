# Akcja Kawowa

Strona wewnętrzna. Akcja kawowa - losowanie osoby kupującej kawę.

## Pliki

```
app/
├── index.html    ← struktura strony (1 plik, tylko <div id="app">)
├── style.css     ← wszystkie style,
├── app.js        ← cała logika,
└── data.json     ← stan: zespół, rundy, zakupy, oceny
```

### `index.html`
Wciąga `style.css` i `app.js`. Cała strona jest budowana w JavaScripcie.

### `style.css` 
Komentarze z numerami sekcji.

### `app.js`
KOoentarze znumerami sekcji.

### `data.json`
Cały stan strony. 

## Co do dorobienia

- Zapis do `data.json` przez GitHub API — teraz zmiany są tylko w pamięci, znikają po odświeżeniu
- Upload zdjęcia kupionej kawy (też przez GitHub API)
- Formularz oceny kawy (każdy ze swojego konta)
- Eksport historii do CSV / kalendarza (.ics)
- Modal "+ dodaj osobę" / "edytuj"
- Klucz Giphy własny zamiast publicznego (publiczny ma niski rate limit)

## Plan: zapis przez GitHub API

Zarys (do zaimplementowania w kolejnym kroku):

1. Wygeneruj **Personal Access Token** na GitHubie (uprawnienia: `repo`)
2. W `app.js` dodaj funkcję `saveData()`:
   - czyta token z `localStorage` (każdy user wkleja go raz)
   - robi PUT na `https://api.github.com/repos/USER/REPO/contents/app/data.json`
   - body: nowy `data.json` zakodowany w base64 + SHA poprzedniego pliku
3. Wołaj `saveData()` po każdym losowaniu / dodaniu osoby / itd.

Plik `data.json` w repo staje się "bazą danych". Każda zmiana = git commit. Historia commitów = audyt.


## Wyglądu

Wszystkie kolory są zmiennymi CSS na górze `style.css` (sekcja 1):

```css
:root {
  --coffee:    #8b5a2b;   /* główny akcent */
  --paper:     #f7f3ec;   /* tło */
  ...
}
```
