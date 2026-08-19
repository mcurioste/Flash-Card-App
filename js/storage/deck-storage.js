(() => {
const defaultDecks = window.RecallDefaultDecks;
const MAX_CARDS = 5000;
const STORAGE_KEY = 'recallFlashcardDecks';
const RECOVERY_KEY_PREFIX = `${STORAGE_KEY}Recovery`;
const CURRENT_STORAGE_VERSION = 1;
const CHANGE_EVENT = 'recall:decks-changed';
const CARD_TEXT_FIELDS = ['word', 'reading', 'type', 'meaning', 'example', 'translation'];
const ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,127}$/u;
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const comparisonKey = (value) => String(value).trim().normalize('NFKC').toLocaleLowerCase();
let storageStatus = null;

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

function fail(message) { throw new Error(message); }
function storedString(value, label, maxLength, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim())) fail(`${label} is invalid.`);
  return value;
}

// Persisted Recall data has its own validation path. Transfer-file validation is
// intentionally stricter and remains in deck-transfer.js.
function prepareStoredDeck(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Deck data is invalid.');
  const deck = clone(value);
  storedString(deck.id, 'deck.id', 128);
  if (!ID_PATTERN.test(deck.id)) fail('deck.id is invalid.');
  storedString(deck.title, 'deck.title', 80);
  storedString(deck.description, 'deck.description', 240, true);
  storedString(deck.language, 'deck.language', 60);
  storedString(deck.level, 'deck.level', 60);
  storedString(deck.prompt, 'deck.prompt', 160);
  if (deck.maxCards !== null && (!Number.isSafeInteger(deck.maxCards) || deck.maxCards < 1 || deck.maxCards > MAX_CARDS)) fail('deck.maxCards is invalid.');
  if (!Array.isArray(deck.cards) || deck.cards.length > MAX_CARDS || (deck.maxCards !== null && deck.cards.length > deck.maxCards)) fail('deck.cards is invalid.');
  const cardIds = new Set();
  deck.cards = deck.cards.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`deck.cards[${index}] is invalid.`);
    const card = clone(value);
    storedString(card.id, `deck.cards[${index}].id`, 128);
    if (!ID_PATTERN.test(card.id) || cardIds.has(card.id)) fail(`deck.cards[${index}].id is invalid.`);
    cardIds.add(card.id);
    CARD_TEXT_FIELDS.forEach((field) => storedString(card[field], `deck.cards[${index}].${field}`, 1000));
    return card;
  });
  return deck;
}

function prepareDeckCollection(value) {
  if (!Array.isArray(value)) throw new Error('Decks must be an array.');
  const prepared = value.map(prepareStoredDeck);
  const ids = new Set();
  prepared.forEach((deck) => { if (ids.has(deck.id)) throw new Error('Deck identifiers must be unique.'); ids.add(deck.id); });
  return prepared;
}

function storageEnvelope(decks) { return { storageVersion: CURRENT_STORAGE_VERSION, decks }; }

function migrateStorage(payload) {
  const detected = Array.isArray(payload) ? { storageVersion: 0, decks: payload } : payload;
  if (!detected || typeof detected !== 'object') fail('Saved storage must be an object or legacy deck array.');
  if (!Number.isSafeInteger(detected.storageVersion)) fail('Saved storage has no valid storage version.');
  if (detected.storageVersion > CURRENT_STORAGE_VERSION) fail(`Storage version ${detected.storageVersion} is not supported by this version of Recall.`);
  if (detected.storageVersion === 0) {
    if (!Array.isArray(detected.decks)) fail('Legacy storage decks must be an array.');
    return { payload: storageEnvelope(detected.decks), migratedFrom: 0 };
  }
  if (detected.storageVersion < CURRENT_STORAGE_VERSION) fail(`Storage version ${detected.storageVersion} has no available migration.`);
  if (!Array.isArray(detected.decks)) fail('Saved storage decks must be an array.');
  return { payload: detected, migratedFrom: null };
}

function prepareDecksIndividually(decks) {
  const valid = [];
  const rejected = [];
  const ids = new Set();
  decks.forEach((rawDeck, index) => {
    try {
      const deck = prepareStoredDeck(rawDeck);
      if (ids.has(deck.id)) fail('Deck identifier is duplicated.');
      ids.add(deck.id);
      valid.push(deck);
    } catch (error) { rejected.push({ index, deck: clone(rawDeck), reason: error?.message || 'Deck data is invalid.' }); }
  });
  return { valid, rejected };
}

function publishChange(external = false) {
  if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { external } }));
}

function prepareStarterDecks() {
  try {
    return prepareDeckCollection(defaultDecks);
  } catch (error) {
    console.warn('Recall starter data is invalid; continuing with an empty library.', error);
    storageStatus = { message: 'Recall could not load its starter deck. You can still create or import decks.' };
    return [];
  }
}

function preserveRecovery(recovery) {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  let key = `${RECOVERY_KEY_PREFIX}:${timestamp}`;
  let suffix = 1;
  while (localStorage.getItem(key) !== null) key = `${RECOVERY_KEY_PREFIX}:${timestamp}:${suffix++}`;
  localStorage.setItem(key, JSON.stringify({ recoveredAt: new Date().toISOString(), ...recovery }));
  return key;
}

function persistEnvelope(decks) { localStorage.setItem(STORAGE_KEY, JSON.stringify(storageEnvelope(decks))); }

function recoverWholePayload(raw, error) {
  console.warn('Recall could not load saved decks; the original data was preserved for recovery.', error);
  let preserved = false;
  try { preserveRecovery({ rawPayload: raw, reason: error?.message || 'Saved storage is invalid.' }); preserved = true; }
  catch (storageError) { console.warn('Recall could not preserve invalid saved data.', storageError); }
  const fallback = prepareStarterDecks();
  storageStatus = { message: preserved ? 'Saved decks could not be loaded and were preserved for recovery.' : 'Saved decks could not be loaded, and Recall could not create a recovery copy.' };
  return fallback;
}

function readStoredDecks() {
  let raw = null;
  storageStatus = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const seeded = prepareStarterDecks();
      try { persistEnvelope(seeded); }
      catch (storageError) {
        console.warn('Recall could not persist starter data.', storageError);
        storageStatus = { message: 'Recall loaded, but changes may not persist in this browser.' };
      }
      return seeded;
    }
    const migration = migrateStorage(JSON.parse(raw));
    const { valid, rejected } = prepareDecksIndividually(migration.payload.decks);
    let recoveryKey = null;
    if (rejected.length) {
      try { recoveryKey = preserveRecovery({ sourceStorageVersion: migration.migratedFrom ?? CURRENT_STORAGE_VERSION, rejectedDecks: rejected }); }
      catch (storageError) { console.warn('Recall could not preserve rejected decks.', storageError); }
      storageStatus = { rejectedDeckCount: rejected.length, recoveryKey, message: recoveryKey ? `${rejected.length} saved ${rejected.length === 1 ? 'deck could' : 'decks could'} not be loaded and ${rejected.length === 1 ? 'was' : 'were'} preserved for recovery.` : `${rejected.length} saved ${rejected.length === 1 ? 'deck could' : 'decks could'} not be loaded, and Recall could not create a recovery copy.` };
    }
    if ((migration.migratedFrom !== null && !rejected.length) || recoveryKey) {
      try { persistEnvelope(valid); }
      catch (storageError) {
        console.warn('Recall could not persist migrated or recovered storage.', storageError);
        storageStatus = { ...storageStatus, message: `${storageStatus?.message ? `${storageStatus.message} ` : ''}Recall could not save the repaired library.` };
      }
    }
    return valid;
  } catch (error) { return recoverWholePayload(raw, error); }
}

let canonicalDecks = readStoredDecks();

function getAllDecks() { return clone(canonicalDecks); }
function getDeckById(id) { const deck = typeof id === 'string' ? canonicalDecks.find((item) => item.id === id) : null; return deck ? clone(deck) : null; }
function getStorageStatus() { return clone(storageStatus); }
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
  persistEnvelope(prepared);
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

function importSelectedCards(sourceDeck, selectedCards, destination, duplicateActions = []) {
  if (!Array.isArray(selectedCards) || selectedCards.length === 0) throw new Error('Select at least one card to import.');
  const preparedSource = prepareStoredDeck({ ...clone(sourceDeck), cards: clone(selectedCards) });
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
  canonicalDecks = readStoredDecks();
  publishChange(true);
});

window.RecallDeckStorage = { STORAGE_KEY, RECOVERY_KEY_PREFIX, CURRENT_STORAGE_VERSION, CHANGE_EVENT, createId, getAllDecks, getDeckById, getStorageStatus, refreshDecks, getCardDuplicateMetadata, createDeck, updateDeck, deleteDeck, addCard, updateCard, deleteCards, importSelectedCards };
})();
