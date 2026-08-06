# Recall Flash Card App

Recall is a responsive, browser-based flashcard application. It supports multiple custom decks, persistent card management, and a focused keyboard-friendly study experience. A Basic Japanese starter deck is included for first-time visitors.

## Live Link

https://mcurioste.github.io/Flash-Card-App/

## Features

- Create, edit, delete, and study multiple decks
- Add, edit, and delete individual or multiple cards
- Local browser persistence with safe starter-data recovery
- Space to reveal or hide; arrow keys to move between cards
- Responsive landing, dashboard, dialogs, and study views
- Accessible labels, status announcements, focus states, and navigation

## Technology

Vanilla HTML, CSS, and JavaScript, native browser APIs, and `localStorage`. Scripts are separated by responsibility and loaded in dependency order. There are no third-party libraries, dependencies, or build tools.

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
```

## Run locally

No installation or build process is required. Double-click `index.html` to open the application directly, or serve the folder with any existing static file server. GitHub Pages can host the application as-is.

## Browser storage

Decks are saved under the `recallFlashcardDecks` key in `localStorage`. Data exists only in the current browser and is not synchronized to an account. To reset Recall, remove that key in the browser developer tools under Application/Storage → Local Storage, then refresh; the starter deck will be restored.

## Current limitations

- Accounts and cloud synchronization are not implemented.
- Spaced repetition and adaptive scheduling are not implemented.
- Cards support text only.
- Clearing site data removes saved decks.

## Planned improvements

Potential future work includes import/export, optional cloud backup, richer card content, and an evidence-based review scheduler.
