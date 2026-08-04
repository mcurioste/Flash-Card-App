(() => {
const defaultDecks = window.RecallDefaultDecks;
const STORAGE_KEY = 'recallFlashcardDecks';
const clone = (value) => JSON.parse(JSON.stringify(value));

function createId(prefix = 'item') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeCard(card) {
  if (!card || typeof card !== 'object') return null;
  const fields = ['word', 'reading', 'type', 'meaning', 'example', 'translation'];
  if (fields.some((field) => typeof card[field] !== 'string')) return null;
  return { id: typeof card.id === 'string' && card.id ? card.id : createId('card'), ...Object.fromEntries(fields.map((field) => [field, card[field]])) };
}

function normalizeDeck(deck) {
  if (!deck || typeof deck !== 'object' || typeof deck.id !== 'string' || !deck.id || !Array.isArray(deck.cards)) return null;
  const cards = deck.cards.map(normalizeCard).filter(Boolean);
  if (cards.length !== deck.cards.length) return null;
  return {
    ...deck,
    id: deck.id,
    title: typeof deck.title === 'string' && deck.title.trim() ? deck.title : 'Untitled deck',
    description: typeof deck.description === 'string' ? deck.description : '',
    language: typeof deck.language === 'string' && deck.language.trim() ? deck.language : 'Unspecified',
    level: typeof deck.level === 'string' && deck.level.trim() ? deck.level : 'All levels',
    prompt: typeof deck.prompt === 'string' && deck.prompt ? deck.prompt : 'WHAT DOES THIS WORD MEAN?',
    cards
  };
}

function loadDecks() {
  const fallback = clone(defaultDecks);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) { saveDecks(fallback); return fallback; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Stored decks must be an array.');
    const normalized = parsed.map(normalizeDeck);
    if (normalized.some((deck) => deck === null)) throw new Error('Stored deck data is invalid.');
    return normalized;
  } catch (error) {
    console.warn('Recall could not load saved decks; starter data was restored.', error);
    saveDecks(fallback);
    return fallback;
  }
}

function saveDecks(decks) { localStorage.setItem(STORAGE_KEY, JSON.stringify(decks)); }
function getDeckById(id) { return loadDecks().find((deck) => deck.id === id) ?? null; }

function mutateDecks(mutation) {
  const decks = loadDecks();
  const result = mutation(decks);
  saveDecks(decks);
  return result;
}

function createDeck(metadata) {
  return mutateDecks((decks) => { const deck = { id: createId('deck'), ...metadata, prompt: 'WHAT DOES THIS WORD MEAN?', cards: [] }; decks.push(deck); return deck; });
}
function updateDeck(id, updates) { return mutateDecks((decks) => { const deck = decks.find((item) => item.id === id); if (!deck) return null; Object.assign(deck, updates, { id, cards: deck.cards }); return deck; }); }
function deleteDeck(id) { return mutateDecks((decks) => { const index = decks.findIndex((deck) => deck.id === id); if (index < 0) return false; decks.splice(index, 1); return true; }); }
function addCard(deckId, card) { return mutateDecks((decks) => { const deck = decks.find((item) => item.id === deckId); if (!deck) return null; const saved = { id: createId('card'), ...card }; deck.cards.push(saved); return saved; }); }
function updateCard(deckId, cardId, updates) { return mutateDecks((decks) => { const deck = decks.find((item) => item.id === deckId); const card = deck?.cards.find((item) => item.id === cardId); if (!card) return null; Object.assign(card, updates, { id: cardId }); return card; }); }
function deleteCards(deckId, cardIds) { return mutateDecks((decks) => { const deck = decks.find((item) => item.id === deckId); if (!deck) return false; const ids = new Set(cardIds); deck.cards = deck.cards.filter((card) => !ids.has(card.id)); return true; }); }

window.RecallDeckStorage = { STORAGE_KEY, createId, loadDecks, saveDecks, getDeckById, createDeck, updateDeck, deleteDeck, addCard, updateCard, deleteCards };
})();
