(() => {
const defaultDecks = window.RecallDefaultDecks;
const { createTransfer, MAX_CARDS } = window.RecallDeckTransfer;
const STORAGE_KEY = 'recallFlashcardDecks';
const RECOVERY_KEY = `${STORAGE_KEY}Recovery`;
const CHANGE_EVENT = 'recall:decks-changed';
const CARD_TEXT_FIELDS = ['word', 'reading', 'type', 'meaning', 'example', 'translation'];
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const comparisonKey = (value) => String(value).trim().normalize('NFKC').toLocaleLowerCase();

function hasDeckTitle(decks, title, excludedId = null) {
  const titleKey = comparisonKey(title);
  return decks.some((deck) => deck.id !== excludedId && comparisonKey(deck.title) === titleKey);
}

function findCardByIdentity(cards, card, excludedId = null) {
  const wordKey = comparisonKey(card.word);
  const readingKey = comparisonKey(card.reading);
  return cards.find((item) => item.id !== excludedId && comparisonKey(item.word) === wordKey && comparisonKey(item.reading) === readingKey) || null;
}

function hasCardIdentity(cards, card, excludedId = null) { return Boolean(findCardByIdentity(cards, card, excludedId)); }

function createId(prefix = 'item') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createUniqueId(existingIds, prefix) {
  let id = createId(prefix);
  while (existingIds.has(id)) id = createId(prefix);
  existingIds.add(id);
  return id;
}

function copyCardsWithUniqueIds(cards, existingIds) {
  return cards.map((card) => {
    const copy = { ...card };
    if (existingIds.has(copy.id)) copy.id = createUniqueId(existingIds, 'card');
    else existingIds.add(copy.id);
    return copy;
  });
}

function normalizeCard(card) {
  if (!card || typeof card !== 'object') return null;
  if (CARD_TEXT_FIELDS.some((field) => typeof card[field] !== 'string')) return null;
  return { id: typeof card.id === 'string' && card.id ? card.id : createId('card'), ...Object.fromEntries(CARD_TEXT_FIELDS.map((field) => [field, card[field]])) };
}

function normalizeDeck(deck) {
  if (!deck || typeof deck !== 'object' || typeof deck.id !== 'string' || !deck.id || !Array.isArray(deck.cards)) return null;
  const cards = deck.cards.map(normalizeCard).filter(Boolean);
  if (cards.length !== deck.cards.length) return null;
  return {
    id: deck.id,
    title: typeof deck.title === 'string' && deck.title.trim() ? deck.title : 'Untitled deck',
    description: typeof deck.description === 'string' ? deck.description : '',
    language: typeof deck.language === 'string' && deck.language.trim() ? deck.language : 'Unspecified',
    level: typeof deck.level === 'string' && deck.level.trim() ? deck.level : 'All levels',
    prompt: typeof deck.prompt === 'string' && deck.prompt ? deck.prompt : 'WHAT DOES THIS WORD MEAN?',
    maxCards: deck.maxCards ?? null,
    cards
  };
}

function prepareDeck(deck) {
  const normalized = normalizeDeck(clone(deck));
  if (!normalized) throw new Error('Deck data is invalid.');
  createTransfer(normalized);
  return normalized;
}

function prepareDeckCollection(value) {
  if (!Array.isArray(value)) throw new Error('Decks must be an array.');
  const prepared = value.map(prepareDeck);
  const ids = new Set();
  prepared.forEach((deck) => { if (ids.has(deck.id)) throw new Error('Deck identifiers must be unique.'); ids.add(deck.id); });
  return prepared;
}

function publishChange(external = false) {
  if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { external } }));
}

function restoreDefaults(raw, error) {
  console.warn('Recall could not load saved decks; starter data was restored.', error);
  const fallback = prepareDeckCollection(defaultDecks);
  try {
    if (raw !== null && localStorage.getItem(RECOVERY_KEY) === null) localStorage.setItem(RECOVERY_KEY, raw);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
  } catch (storageError) { console.warn('Recall could not persist recovered starter data.', storageError); }
  return fallback;
}

function readStoredDecks() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const seeded = prepareDeckCollection(defaultDecks);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return prepareDeckCollection(JSON.parse(raw));
  } catch (error) { return restoreDefaults(raw, error); }
}

let canonicalDecks = readStoredDecks();

function getAllDecks() { return clone(canonicalDecks); }
function getDeckById(id) { const deck = typeof id === 'string' ? canonicalDecks.find((item) => item.id === id) : null; return deck ? clone(deck) : null; }
function refreshDecks() { canonicalDecks = readStoredDecks(); return getAllDecks(); }
function getCardDuplicateMetadata(deckId, cards) {
  const deck = typeof deckId === 'string' ? canonicalDecks.find((item) => item.id === deckId) : null;
  if (!Array.isArray(cards)) return [];
  return cards.map((card) => {
    const match = deck ? findCardByIdentity(deck.cards, card) : null;
    return { isDuplicate: Boolean(match), matchingCardId: match?.id ?? null };
  });
}

function commitDecks(decks) {
  const prepared = prepareDeckCollection(decks);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  canonicalDecks = prepared;
  publishChange();
}

function mutateDecks(mutation) {
  const workingDecks = getAllDecks();
  const result = mutation(workingDecks);
  commitDecks(workingDecks);
  return clone(result);
}

function createDeck(metadata) {
  return mutateDecks((decks) => { if (hasDeckTitle(decks, metadata.title)) return null; const deck = { title: metadata.title, description: metadata.description, language: metadata.language, level: metadata.level, id: createUniqueId(new Set(decks.map((item) => item.id)), 'deck'), prompt: 'WHAT DOES THIS WORD MEAN?', maxCards: null, cards: [] }; decks.push(deck); return deck; });
}
function updateDeck(id, updates) { return mutateDecks((decks) => { const deck = decks.find((item) => item.id === id); if (!deck || hasDeckTitle(decks, updates.title, id)) return null; ['title', 'description', 'language', 'level'].forEach((field) => { deck[field] = updates[field]; }); return deck; }); }
function deleteDeck(id) { return mutateDecks((decks) => { const index = decks.findIndex((deck) => deck.id === id); if (index < 0) return false; decks.splice(index, 1); return true; }); }
function addCard(deckId, card) { return mutateDecks((decks) => { const deck = decks.find((item) => item.id === deckId); if (!deck || hasCardIdentity(deck.cards, card)) return null; const limit = deck.maxCards === null ? MAX_CARDS : Math.min(deck.maxCards, MAX_CARDS); if (deck.cards.length >= limit) throw new Error(`This deck cannot contain more than ${limit} cards.`); const saved = normalizeCard({ ...card, id: createUniqueId(new Set(deck.cards.map((item) => item.id)), 'card') }); if (!saved) throw new Error('Card data is invalid.'); deck.cards.push(saved); return saved; }); }
function updateCard(deckId, cardId, updates) { return mutateDecks((decks) => { const deck = decks.find((item) => item.id === deckId); const card = deck?.cards.find((item) => item.id === cardId); if (!card) return null; const identityChanged = comparisonKey(card.word) !== comparisonKey(updates.word) || comparisonKey(card.reading) !== comparisonKey(updates.reading); if (identityChanged && hasCardIdentity(deck.cards, updates, cardId)) return null; CARD_TEXT_FIELDS.forEach((field) => { card[field] = updates[field]; }); return card; }); }
function deleteCards(deckId, cardIds) { return mutateDecks((decks) => { const deck = decks.find((item) => item.id === deckId); if (!deck) return false; const ids = new Set(cardIds); deck.cards = deck.cards.filter((card) => !ids.has(card.id)); return true; }); }
function importDeck(deck) {
  return mutateDecks((decks) => {
    if (decks.some((item) => item.id === deck.id) || hasDeckTitle(decks, deck.title)) return null;
    const copy = normalizeDeck(clone(deck));
    if (!copy) return null;
    decks.push(copy);
    return copy;
  });
}

function importSelectedCards(sourceDeck, selectedCards, destination, duplicateActions = []) {
  if (!Array.isArray(selectedCards) || selectedCards.length === 0) throw new Error('Select at least one card to import.');
  const preparedSource = prepareDeck({ ...clone(sourceDeck), cards: clone(selectedCards) });
  if (!Array.isArray(duplicateActions)) throw new Error('Duplicate-card actions are invalid.');
  const selectedIds = new Set(preparedSource.cards.map((card) => card.id));
  const actionsByCardId = new Map();
  duplicateActions.forEach((decision) => {
    if (!decision || !selectedIds.has(decision.cardId) || actionsByCardId.has(decision.cardId) || !['skip', 'add-copy', 'replace'].includes(decision.action)) throw new Error('Duplicate-card actions are invalid.');
    actionsByCardId.set(decision.cardId, { action: decision.action, matchingCardId: decision.matchingCardId });
  });
  return mutateDecks((decks) => {
    if (destination?.mode === 'existing') {
      const deck = decks.find((item) => item.id === destination.deckId);
      if (!deck) throw new Error('The selected destination deck is no longer available.');
      const limit = deck.maxCards === null ? MAX_CARDS : Math.min(deck.maxCards, MAX_CARDS);
      const nonduplicateCards = [];
      const copyCards = [];
      const replacements = [];
      const replacementTargets = new Set();
      let skippedCount = 0;
      preparedSource.cards.forEach((card) => {
        const match = findCardByIdentity(deck.cards, card);
        const decision = actionsByCardId.get(card.id);
        if (!match) {
          if (decision) throw new Error(`“${card.word}” is no longer a duplicate in the selected deck. Review its import action.`);
          nonduplicateCards.push(card);
          return;
        }
        const action = decision?.action ?? 'skip';
        const matchingCardId = decision?.matchingCardId ?? match.id;
        const target = typeof matchingCardId === 'string' ? deck.cards.find((item) => item.id === matchingCardId) : null;
        if (!target || !hasCardIdentity([target], card)) throw new Error(`The matching card for “${card.word}” changed. Review the import again.`);
        if (action === 'skip') { skippedCount += 1; return; }
        if (action === 'add-copy') { copyCards.push(card); return; }
        if (replacementTargets.has(target.id)) throw new Error('Two imported cards cannot replace the same existing card. Choose Skip or Add copy for one of them.');
        replacementTargets.add(target.id);
        replacements.push({ card, targetId: target.id });
      });
      const addedCount = nonduplicateCards.length + copyCards.length;
      const available = Math.max(0, limit - deck.cards.length);
      if (addedCount > available) throw new Error(`“${deck.title}” has room for ${available} more ${available === 1 ? 'card' : 'cards'}, but ${addedCount} cards would be added. Skip cards or replace existing cards.`);
      const ids = new Set(deck.cards.map((card) => card.id));
      const importedCards = copyCardsWithUniqueIds(nonduplicateCards, ids);
      const importedCopies = copyCards.map((card) => ({ ...card, id: createUniqueId(ids, 'card') }));
      const proposedCards = deck.cards.map((card) => {
        const replacement = replacements.find((item) => item.targetId === card.id);
        return replacement ? { ...card, ...Object.fromEntries(CARD_TEXT_FIELDS.map((field) => [field, replacement.card[field]])) } : card;
      });
      proposedCards.push(...importedCards, ...importedCopies);
      deck.cards = proposedCards;
      const affectedIds = [...importedCards, ...importedCopies].map((card) => card.id).concat(replacements.map((item) => item.targetId));
      return { deck, importedCount: affectedIds.length, importedCardIds: affectedIds, created: false, nonduplicateAdded: importedCards.length, copiesAdded: importedCopies.length, replacedCount: replacements.length, skippedCount };
    }

    if (destination?.mode !== 'new') throw new Error('Choose where to import the selected cards.');
    const title = typeof destination.title === 'string' ? destination.title.trim() : '';
    if (!title || title.length > 80) throw new Error('Deck name must be between 1 and 80 characters.');
    if (hasDeckTitle(decks, title)) throw new Error('A deck with this title already exists.');
    const deckIds = new Set(decks.map((deck) => deck.id));
    const deck = { ...preparedSource, id: createUniqueId(deckIds, 'deck'), title };
    decks.push(deck);
    return { deck, importedCount: deck.cards.length, importedCardIds: deck.cards.map((card) => card.id), created: true, nonduplicateAdded: deck.cards.length, copiesAdded: 0, replacedCount: 0, skippedCount: 0 };
  });
}

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  try { canonicalDecks = event.newValue === null ? prepareDeckCollection(defaultDecks) : prepareDeckCollection(JSON.parse(event.newValue)); publishChange(true); }
  catch (error) { console.warn('Recall ignored an invalid external deck update.', error); }
});

window.RecallDeckStorage = { STORAGE_KEY, CHANGE_EVENT, createId, getAllDecks, getDeckById, refreshDecks, getCardDuplicateMetadata, createDeck, updateDeck, deleteDeck, addCard, updateCard, deleteCards, importDeck, importSelectedCards };
})();
