# ISK-kalkylator

En kalkylator för svenskt investeringssparkonto (ISK) med diagram, ränta-på-ränta-simulering, avgiftsjämförelse och FIRE-beräkning (ekonomisk frihet).

**Repository:** [github.com/delit/isk](https://github.com/delit/isk)

## Filer

- **`index.html`** – huvudfil (struktur + innehåll)
- **`styles.css`** – all styling (mörkt guld/svart-tema, responsiv design)
- **`app.js`** – all logik (beräkningar, diagram, interaktion)
- **`manifest.json`**, **`sw.js`**, **`pwa.js`**, **`version.json`**, **`icons/`** – PWA (valfritt offline-stöd, installera som app på mobil)

## Externa bibliotek (laddas från CDN)

- [Chart.js 4.4.1](https://www.chartjs.org/)
- Google Fonts: Fraunces, JetBrains Mono, Inter Tight

Ingen lokal installation eller build-process behövs för att använda sidan.

## Funktioner

- **Simulering** med månatliga insättningar, ISK-skatt, fondavgift och valbar avkastning (6–10 %)
- **Stopp-scenarier** där månadssparandet upphör efter X år men kapitalet fortsätter växa
- **Interaktivt diagram** med popup-info och jämförelseläge mellan avkastningsnivåer
- **Tabell** över årsvis utveckling för alla scenarier
- **Avgiftens påverkan** – jämförelse mellan 0,1–2 % fondavgift
- **Ekonomisk frihet** – uttagsberäkning per år/månad enligt 4 %-regeln
- **FIRE-nummer** – hur mycket kapital som krävs för att leva på sitt sparande
- **Sparkvot-kalkylator** – baserad på Mr. Money Mustache-modellen
