# Recall Flash Card App

Recall is a responsive, browser-based flashcard application. It supports multiple custom decks, persistent card management, and a focused keyboard-friendly study experience. A Basic Japanese starter deck is included for first-time visitors.

## Live Link

https://mcurioste.github.io/Flash-Card-App/

## Features

- Create, edit, delete, and study multiple decks
- Export a deck as versioned JSON or spreadsheet-friendly CSV and import it again
- Add, edit, and delete individual or multiple cards
- Local browser persistence with safe starter-data recovery
- Space to reveal or hide; arrow keys to move between cards
- Responsive landing, dashboard, dialogs, and study views
- Accessible labels, status announcements, focus states, and navigation
- Optional Cognito account creation, email verification, sign-in, and sign-out

## Technology

Vanilla HTML, CSS, and JavaScript, native browser APIs, and `localStorage`. Scripts are separated by responsibility and loaded in dependency order. AWS Amplify provides Cognito authentication, and Vite bundles the existing multi-page application without introducing a UI framework.

## Structure

```text
index.html              Landing page
decks.html/decks.css    Deck dashboard
study.html/study.css    Study and card-management interface
styles.css              Shared design system
script.js               Landing-page behavior
study.js                Study-page behavior
js/data/                 Default starter data
js/storage/              Storage and mutation functions
js/pages/                Dashboard behavior
js/shared/               Shared navigation behavior
js/auth/                 Cognito configuration, auth helpers, and shared auth UI
vite.config.mjs          Multi-page production build configuration
```

## Run locally

Install dependencies, then start the Vite development server:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Do not open the HTML files directly with `file://`; browser module imports and cross-page storage require an HTTP origin.

Create a production build with `npm run build`, then test that build locally with `npm run preview`. Deploy the generated `dist/` directory to a static host such as GitHub Pages.

## Authentication

The shared `js/auth/cognito.js` module configures Amplify once for the Recall Cognito user pool and exports small functions for account creation, confirmation, sign-in, sign-out, session detection, and access-token retrieval. `js/auth/auth-ui.js` adds the account dialog to each page. Authentication is optional and does not change local deck storage.

To obtain a Cognito access-token JWT for a future authenticated request:

```js
import { getAccessToken } from './js/auth/cognito.js';

const accessToken = await getAccessToken();
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```

The frontend contains only the Cognito User Pool ID and public app client ID. The app client must not have a client secret.

## Browser storage

`RecallDeckStorage` is the single deck repository used by the dashboard, study view, imports, exports, and every deck/card mutation. It owns one validated in-memory collection and persists a versioned envelope under the `recallFlashcardDecks` key in `localStorage`; the static default deck is used only to seed an empty store. Legacy bare-array storage is migrated automatically. Invalid decks are isolated while valid decks remain available, and rejected data is preserved under uniquely named `recallFlashcardDecksRecovery:*` keys.

Data exists only in the current browser origin and is not synchronized to an account. To reset Recall, remove the `recallFlashcardDecks` key in browser developer tools and refresh; the starter deck will be restored.

## Deck transfer format

Exports use schema version `1`. JSON files contain exactly `schemaVersion`, `exportedAt`, and `deck`; a deck contains `id`, `title`, `description`, `language`, `level`, `prompt`, `maxCards`, and `cards`. Every card contains `id`, `word`, `reading`, `type`, `meaning`, `example`, and `translation`. CSV exports represent the same structure with one card per row and repeated deck metadata.

Imports are parsed locally and are limited to 2 MB and 5,000 cards. After validation, Recall shows every card in a review dialog so users can choose cards and either create a new deck or append them to an existing one; nothing is stored until that import is confirmed. The same limits are enforced when decks are saved, and both generated JSON and CSV representations must remain within 2 MB so every successful export can be restored. Recall rejects mismatched extensions/media types, unknown or missing fields, invalid lengths or identifiers, duplicate card IDs, malformed CSV/JSON, unsupported schema versions, and conflicting deck titles. When importing into an existing deck, a card matches an existing card when its trimmed, Unicode-normalized, case-insensitive word and reading both match. Matching cards default to Skip and can explicitly be added as a new copy or used to replace the matched card’s editable content while preserving its ID and position. CSV exports also neutralize spreadsheet-formula prefixes—including formula characters preceded by apostrophes, control characters, or whitespace—while preserving their original value when re-imported.

## Current limitations

- Accounts do not synchronize locally stored decks yet.
- The existing Recall Cloud starter-deck request is not authenticated yet.
- Spaced repetition and adaptive scheduling are not implemented.
- Cards support text only.
- Clearing site data removes saved decks.

## Planned improvements

Potential future work includes optional cloud backup, richer card content, and an evidence-based review scheduler.
