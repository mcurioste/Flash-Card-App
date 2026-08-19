const assert = require('node:assert/strict');
const { File } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { TextDecoder, TextEncoder } = require('node:util');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadRecall(options = {}) {
  const values = options.values || new Map();
  if (Object.hasOwn(options, 'storedValue')) values.set('recallFlashcardDecks', options.storedValue);
  let storageListener = null;
  const context = vm.createContext({
    console: options.console || { ...console, warn: () => {} },
    crypto: { randomUUID: (() => { let id = 0; return () => `generated-${++id}`; })() },
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value))
    },
    setTimeout,
    TextDecoder,
    TextEncoder,
    URL,
    Blob,
    File
  });
  context.window = context;
  context.globalThis = context;
  context.addEventListener = (type, listener) => { if (type === 'storage') storageListener = listener; };
  context.dispatchEvent = () => true;
  vm.runInContext(fs.readFileSync(path.join(root, 'js/data/default-decks.js'), 'utf8'), context, { filename: 'js/data/default-decks.js' });
  if (Object.hasOwn(options, 'defaultDecks')) context.RecallDefaultDecks = options.defaultDecks;
  ['js/shared/deck-transfer.js', 'js/storage/deck-storage.js'].forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  context.__storageValues = values;
  context.__dispatchStorage = (newValue) => storageListener?.({ key: 'recallFlashcardDecks', newValue });
  return context;
}

function card(id, word, reading, meaning = 'meaning') {
  return { id, word, reading, type: 'NOUN', meaning, example: 'example', translation: 'translation' };
}

function sourceDeck(title, cards) {
  return { id: `source-${title.replace(/\s/g, '-')}`, title, description: '', language: 'Japanese', level: 'Test', prompt: 'Meaning?', maxCards: null, cards };
}

test('Phase 1 imports preserve uniqueness, expose matches, and skip duplicate cards', () => {
  const recall = loadRecall();
  const storage = recall.RecallDeckStorage;
  const destination = storage.createDeck({ title: 'Destination', description: 'Test', language: 'Japanese', level: 'Test' });
  assert.ok(destination);
  assert.equal(storage.createDeck({ title: '  destination  ', description: 'Test', language: 'Japanese', level: 'Test' }), null);

  const existing = storage.addCard(destination.id, card('ignored', ' 猫 ', 'ネコ', 'cat'));
  const duplicate = card('duplicate', '猫', ' ネコ ');
  const unique = card('unique', '犬', 'いぬ', 'dog');
  const metadata = storage.getCardDuplicateMetadata(destination.id, [duplicate, unique]);
  assert.deepEqual(JSON.parse(JSON.stringify(metadata)), [
    { isDuplicate: true, matchingCardId: existing.id },
    { isDuplicate: false, matchingCardId: null }
  ]);

  const mixedResult = storage.importSelectedCards(sourceDeck('Mixed', [duplicate, unique]), [duplicate, unique], { mode: 'existing', deckId: destination.id });
  assert.equal(mixedResult.importedCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(storage.getDeckById(destination.id).cards.map((item) => item.word))), [' 猫 ', '犬']);

  const newResult = storage.importSelectedCards(sourceDeck('Unique import', [card('bird', '鳥', 'とり')]), [card('bird', '鳥', 'とり')], { mode: 'new', title: 'Unique import' });
  assert.equal(newResult.created, true);
  const beforeDuplicateDeck = JSON.stringify(storage.getAllDecks());
  assert.throws(() => storage.importSelectedCards(sourceDeck('Other', [card('fish', '魚', 'さかな')]), [card('fish', '魚', 'さかな')], { mode: 'new', title: ' unique import ' }), /already exists/);
  assert.equal(JSON.stringify(storage.getAllDecks()), beforeDuplicateDeck);

  const added = storage.addCard(destination.id, card('manual', '空', 'そら'));
  assert.equal(storage.getDeckById(destination.id).cards.some((item) => item.id === added.id), true);
  assert.equal(storage.deleteCards(destination.id, [added.id]), true);
  assert.equal(storage.getDeckById(destination.id).cards.some((item) => item.id === added.id), false);
  assert.equal(recall.RecallDeckTransfer.createTransfer(storage.getDeckById(destination.id)).deck.cards.length, 2);
  assert.equal(JSON.parse(recall.localStorage.getItem(storage.STORAGE_KEY)).decks.find((deck) => deck.id === destination.id).cards.length, 2);
});

test('fresh storage seeds valid defaults in the current versioned envelope', () => {
  const recall = loadRecall();
  const storage = recall.RecallDeckStorage;
  const saved = JSON.parse(recall.localStorage.getItem(storage.STORAGE_KEY));
  assert.equal(saved.storageVersion, storage.CURRENT_STORAGE_VERSION);
  assert.deepEqual(saved.decks, JSON.parse(JSON.stringify(storage.getAllDecks())));
  assert.equal(storage.getStorageStatus(), null);
});

test('invalid defaults still initialize a usable storage API with an empty library', () => {
  const recall = loadRecall({ defaultDecks: [{ id: 'broken-default', cards: 'not an array' }] });
  const storage = recall.RecallDeckStorage;
  assert.ok(storage);
  assert.deepEqual(JSON.parse(JSON.stringify(storage.getAllDecks())), []);
  assert.match(storage.getStorageStatus().message, /starter deck/);
  assert.deepEqual(JSON.parse(recall.localStorage.getItem(storage.STORAGE_KEY)), { storageVersion: 1, decks: [] });
  assert.ok(storage.createDeck({ title: 'After recovery', description: 'Works', language: 'English', level: 'Beginner' }));
});

test('legacy bare-array storage migrates without changing valid decks', () => {
  const original = [sourceDeck('Legacy', [card('legacy-card', 'old', 'old')])];
  const recall = loadRecall({ storedValue: JSON.stringify(original) });
  const storage = recall.RecallDeckStorage;
  assert.deepEqual(JSON.parse(JSON.stringify(storage.getAllDecks())), original);
  assert.deepEqual(JSON.parse(recall.localStorage.getItem(storage.STORAGE_KEY)), { storageVersion: storage.CURRENT_STORAGE_VERSION, decks: original });
});

test('an explicit legacy version-zero envelope uses the same migration', () => {
  const decks = [sourceDeck('Explicit legacy', [card('explicit-card', 'old', 'old')])];
  const recall = loadRecall({ storedValue: JSON.stringify({ storageVersion: 0, decks }) });
  assert.deepEqual(JSON.parse(recall.localStorage.getItem('recallFlashcardDecks')), { storageVersion: 1, decks });
  assert.deepEqual(JSON.parse(JSON.stringify(recall.RecallDeckStorage.getAllDecks())), decks);
});

test('current-version storage loads normally without rewriting valid data', () => {
  const decks = [sourceDeck('Current', [card('current-card', 'now', 'now')])];
  const raw = JSON.stringify({ storageVersion: 1, decks });
  const recall = loadRecall({ storedValue: raw });
  assert.deepEqual(JSON.parse(JSON.stringify(recall.RecallDeckStorage.getAllDecks())), decks);
  assert.equal(recall.localStorage.getItem('recallFlashcardDecks'), raw);
  assert.equal(recall.RecallDeckStorage.getStorageStatus(), null);
});

test('persisted storage tolerates internal fields without weakening transfer validation', () => {
  const deck = { ...sourceDeck('Internal', [{ ...card('internal-card', 'inside', 'inside'), internalNote: 'keep me' }]), storageMetadata: { source: 'future Recall' } };
  const raw = JSON.stringify({ storageVersion: 1, decks: [deck], envelopeMetadata: true });
  const recall = loadRecall({ storedValue: raw });
  assert.deepEqual(JSON.parse(JSON.stringify(recall.RecallDeckStorage.getAllDecks())), [deck]);

  const transfer = recall.RecallDeckTransfer.createTransfer(deck);
  transfer.unexpected = true;
  assert.throws(() => recall.RecallDeckTransfer.validateTransfer(transfer), /exactly schemaVersion, exportedAt, and deck/);
});

test('one corrupted stored deck is isolated while valid decks survive unchanged', () => {
  const first = sourceDeck('First', [card('first-card', 'one', 'one')]);
  const rejected = { ...sourceDeck('Broken', [card('broken-card', 'bad', 'bad')]), cards: [{ id: 'broken-card', word: 'missing fields' }] };
  const third = sourceDeck('Third', [card('third-card', 'three', 'three')]);
  const recall = loadRecall({ storedValue: JSON.stringify({ storageVersion: 1, decks: [first, rejected, third] }) });
  const storage = recall.RecallDeckStorage;
  assert.deepEqual(JSON.parse(JSON.stringify(storage.getAllDecks())), [first, third]);
  assert.equal(storage.getStorageStatus().rejectedDeckCount, 1);
  const recovery = JSON.parse(recall.localStorage.getItem(storage.getStorageStatus().recoveryKey));
  assert.deepEqual(recovery.rejectedDecks[0].deck, rejected);
  assert.deepEqual(JSON.parse(recall.localStorage.getItem(storage.STORAGE_KEY)).decks, [first, third]);
});

test('all corrupted stored decks are preserved and produce an empty valid library', () => {
  const invalid = [{ id: 'bad-one' }, null];
  const recall = loadRecall({ storedValue: JSON.stringify({ storageVersion: 1, decks: invalid }) });
  const storage = recall.RecallDeckStorage;
  assert.deepEqual(JSON.parse(JSON.stringify(storage.getAllDecks())), []);
  assert.equal(storage.getStorageStatus().rejectedDeckCount, 2);
  assert.equal(JSON.parse(recall.localStorage.getItem(storage.getStorageStatus().recoveryKey)).rejectedDecks.length, 2);
});

test('malformed JSON is preserved and storage remains available with safe defaults', () => {
  const raw = '{not json';
  const recall = loadRecall({ storedValue: raw });
  const storage = recall.RecallDeckStorage;
  assert.ok(storage);
  assert.equal(recall.localStorage.getItem(storage.STORAGE_KEY), raw);
  const recoveryKey = [...recall.__storageValues.keys()].find((key) => key.startsWith(`${storage.RECOVERY_KEY_PREFIX}:`));
  assert.equal(JSON.parse(recall.localStorage.getItem(recoveryKey)).rawPayload, raw);
  assert.match(storage.getStorageStatus().message, /preserved for recovery/);
});

test('unsupported future storage is preserved without replacing the original payload', () => {
  const raw = JSON.stringify({ storageVersion: 999, decks: [] });
  const recall = loadRecall({ storedValue: raw });
  const storage = recall.RecallDeckStorage;
  assert.ok(storage);
  assert.equal(recall.localStorage.getItem(storage.STORAGE_KEY), raw);
  const recoveryKey = [...recall.__storageValues.keys()].find((key) => key.startsWith(`${storage.RECOVERY_KEY_PREFIX}:`));
  assert.equal(JSON.parse(recall.localStorage.getItem(recoveryKey)).rawPayload, raw);
});

test('repeated recovery events use unique keys and preserve prior recovery data', () => {
  const values = new Map();
  const firstRaw = '{first invalid';
  const recall = loadRecall({ storedValue: firstRaw, values });
  const storage = recall.RecallDeckStorage;
  const firstKey = [...values.keys()].find((key) => key.startsWith(`${storage.RECOVERY_KEY_PREFIX}:`));
  const firstRecovery = values.get(firstKey);
  const secondRaw = '{second invalid';
  values.set(storage.STORAGE_KEY, secondRaw);
  storage.refreshDecks();
  const recoveryKeys = [...values.keys()].filter((key) => key.startsWith(`${storage.RECOVERY_KEY_PREFIX}:`));
  assert.equal(recoveryKeys.length, 2);
  assert.equal(values.get(firstKey), firstRecovery);
  assert.equal(JSON.parse(values.get(recoveryKeys.find((key) => key !== firstKey))).rawPayload, secondRaw);
});

test('a recovery-write failure does not replace the original corrupted payload', () => {
  const values = new Map();
  const recall = loadRecall({ values });
  const storage = recall.RecallDeckStorage;
  const valid = sourceDeck('Survivor', []);
  const raw = JSON.stringify({ storageVersion: 1, decks: [valid, { id: 'rejected' }] });
  values.set(storage.STORAGE_KEY, raw);
  recall.localStorage.setItem = (key, value) => {
    if (key.startsWith(storage.RECOVERY_KEY_PREFIX)) throw new Error('Recovery storage unavailable');
    values.set(key, String(value));
  };

  assert.deepEqual(JSON.parse(JSON.stringify(storage.refreshDecks())), [valid]);
  assert.equal(values.get(storage.STORAGE_KEY), raw);
  assert.equal(storage.getStorageStatus().recoveryKey, null);
  assert.match(storage.getStorageStatus().message, /could not create a recovery copy/);
});

test('all-valid stored decks require no recovery copy', () => {
  const decks = [sourceDeck('One', []), sourceDeck('Two', [card('two-card', 'two', 'two')])];
  const recall = loadRecall({ storedValue: JSON.stringify({ storageVersion: 1, decks }) });
  assert.deepEqual(JSON.parse(JSON.stringify(recall.RecallDeckStorage.getAllDecks())), decks);
  assert.equal([...recall.__storageValues.keys()].some((key) => key.startsWith(recall.RecallDeckStorage.RECOVERY_KEY_PREFIX)), false);
});

test('deck and card mutations, refresh, and cross-tab reload stay transparent with versioned storage', () => {
  const values = new Map();
  const firstTab = loadRecall({ values });
  const secondTab = loadRecall({ values });
  const first = firstTab.RecallDeckStorage;
  const second = secondTab.RecallDeckStorage;
  const created = first.createDeck({ title: 'Workflow', description: 'Initial', language: 'English', level: 'Beginner' });
  assert.equal(first.updateDeck(created.id, { title: 'Workflow updated', description: 'Edited', language: 'English', level: 'Intermediate' }).description, 'Edited');
  const added = first.addCard(created.id, card('ignored', 'term', 'reading'));
  assert.equal(first.updateCard(created.id, added.id, { ...added, meaning: 'updated meaning' }).meaning, 'updated meaning');
  first.deleteCards(created.id, [added.id]);

  const serialized = JSON.parse(values.get(first.STORAGE_KEY));
  assert.equal(serialized.storageVersion, first.CURRENT_STORAGE_VERSION);
  assert.equal(serialized.decks.find((deck) => deck.id === created.id).cards.length, 0);
  secondTab.__dispatchStorage(values.get(first.STORAGE_KEY));
  assert.equal(second.getDeckById(created.id).title, 'Workflow updated');

  first.deleteDeck(created.id);
  second.refreshDecks();
  assert.equal(second.getDeckById(created.id), null);
});

test('Phase 3 atomically skips, copies, and replaces duplicate cards', () => {
  const recall = loadRecall();
  const storage = recall.RecallDeckStorage;
  const destination = storage.createDeck({ title: 'Actions', description: 'Test', language: 'Japanese', level: 'Test' });
  const cat = storage.addCard(destination.id, card('cat-original', 'cat', 'cat', 'old cat'));
  const dog = storage.addCard(destination.id, card('dog-original', 'dog', 'dog', 'old dog'));
  const fish = storage.addCard(destination.id, card('fish-original', 'fish', 'fish', 'old fish'));
  const imported = [card('cat-import', 'cat', 'cat', 'new cat'), card('bird-import', 'bird', 'bird', 'new bird'), card('dog-import', 'dog', 'dog', 'new dog'), card('fish-import', 'fish', 'fish', 'new fish')];
  const metadata = storage.getCardDuplicateMetadata(destination.id, imported);

  const result = storage.importSelectedCards(sourceDeck('Actions import', imported), imported, { mode: 'existing', deckId: destination.id }, [
    { cardId: imported[0].id, action: 'add-copy', matchingCardId: metadata[0].matchingCardId },
    { cardId: imported[2].id, action: 'replace', matchingCardId: metadata[2].matchingCardId },
    { cardId: imported[3].id, action: 'skip', matchingCardId: metadata[3].matchingCardId }
  ]);

  const saved = storage.getDeckById(destination.id);
  assert.equal(result.nonduplicateAdded, 1);
  assert.equal(result.copiesAdded, 1);
  assert.equal(result.replacedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(saved.cards.length, 5);
  assert.equal(saved.cards.find((item) => item.id === cat.id).meaning, 'old cat');
  assert.equal(saved.cards.filter((item) => item.word === 'cat').length, 2);
  assert.notEqual(saved.cards.find((item) => item.word === 'cat' && item.id !== cat.id).id, imported[0].id);
  assert.equal(saved.cards.find((item) => item.id === dog.id).meaning, 'new dog');
  assert.equal(saved.cards.findIndex((item) => item.id === dog.id), 1);
  assert.equal(saved.cards.find((item) => item.id === fish.id).meaning, 'old fish');
  assert.equal(storage.updateCard(destination.id, cat.id, { ...cat, meaning: 'edited copy family' }).meaning, 'edited copy family');
  assert.equal(recall.RecallDeckTransfer.createTransfer(storage.getDeckById(destination.id)).deck.cards.length, 5);

  const repeated = [card('cat-again-1', 'cat', 'cat'), card('cat-again-2', 'cat', 'cat')];
  const repeatedMetadata = storage.getCardDuplicateMetadata(destination.id, repeated);
  assert.equal(repeatedMetadata[0].matchingCardId, repeatedMetadata[1].matchingCardId);
  const beforeConflict = JSON.stringify(storage.getDeckById(destination.id));
  assert.throws(() => storage.importSelectedCards(sourceDeck('Conflict', repeated), repeated, { mode: 'existing', deckId: destination.id }, repeated.map((item, index) => ({ cardId: item.id, action: 'replace', matchingCardId: repeatedMetadata[index].matchingCardId }))), /cannot replace the same existing card/);
  assert.equal(JSON.stringify(storage.getDeckById(destination.id)), beforeConflict);
  const resolved = storage.importSelectedCards(sourceDeck('Conflict resolved', repeated), repeated, { mode: 'existing', deckId: destination.id }, [
    { cardId: repeated[0].id, action: 'replace', matchingCardId: repeatedMetadata[0].matchingCardId },
    { cardId: repeated[1].id, action: 'add-copy', matchingCardId: repeatedMetadata[1].matchingCardId }
  ]);
  assert.equal(resolved.replacedCount, 1);
  assert.equal(resolved.copiesAdded, 1);
  assert.equal(storage.createDeck({ title: ' actions ', description: 'Test', language: 'Japanese', level: 'Test' }), null);
});

test('Phase 4 derives stable filtered views without mutating preview state', () => {
  const source = fs.readFileSync(path.join(root, 'js/pages/decks-page.js'), 'utf8');
  const start = source.indexOf('function duplicateFirstPreviewCards');
  const end = source.indexOf('function renderImportCards');
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ result: null });
  vm.runInContext(`${source.slice(start, end)}\nresult = { duplicateFirstPreviewCards, visiblePreviewCards };`, context);
  const { duplicateFirstPreviewCards, visiblePreviewCards } = context.result;
  const cards = [
    { card: { id: 'n1' }, isDuplicate: false },
    { card: { id: 'd1' }, isDuplicate: true, matchingCardId: 'existing-1' },
    { card: { id: 'n2' }, isDuplicate: false },
    { card: { id: 'd2' }, isDuplicate: true, matchingCardId: 'existing-2' }
  ];
  const selected = new Set(['n2']);
  const actions = new Map([['d1', { action: 'add-copy', matchingCardId: 'existing-1' }], ['d2', { action: 'replace', matchingCardId: 'existing-2' }]]);
  const snapshot = JSON.stringify(cards);
  const ids = (items) => Array.from(items, (item) => item.card.id);

  assert.deepEqual(ids(duplicateFirstPreviewCards(cards)), ['d1', 'd2', 'n1', 'n2']);
  assert.deepEqual(ids(visiblePreviewCards(cards, 'all')), ['d1', 'd2', 'n1', 'n2']);
  assert.deepEqual(ids(visiblePreviewCards(cards, 'duplicates')), ['d1', 'd2']);
  assert.deepEqual(ids(visiblePreviewCards(cards, 'nonduplicates')), ['n1', 'n2']);
  assert.equal(JSON.stringify(cards), snapshot);
  assert.deepEqual([...selected], ['n2']);
  assert.deepEqual(JSON.parse(JSON.stringify([...actions])), [['d1', { action: 'add-copy', matchingCardId: 'existing-1' }], ['d2', { action: 'replace', matchingCardId: 'existing-2' }]]);
  assert.equal(visiblePreviewCards(cards.filter((item) => !item.isDuplicate), 'duplicates').length, 0);
  assert.equal(visiblePreviewCards(cards.filter((item) => item.isDuplicate), 'nonduplicates').length, 0);
});

test('Phase 4 new-card bulk actions preserve every duplicate decision', () => {
  const source = fs.readFileSync(path.join(root, 'js/pages/decks-page.js'), 'utf8');
  const filterStart = source.indexOf('function duplicateFirstPreviewCards');
  const filterEnd = source.indexOf('function renderImportCards');
  const start = source.indexOf('function setAllNewCardSelection');
  const end = source.indexOf('function setAllImportCards');
  assert.ok(filterStart >= 0 && filterEnd > filterStart && start >= 0 && end > start);
  const context = vm.createContext({ result: null });
  vm.runInContext(`${source.slice(filterStart, filterEnd)}\n${source.slice(start, end)}\nresult = { setAllNewCardSelection, visiblePreviewCards };`, context);
  const { setAllNewCardSelection, visiblePreviewCards } = context.result;
  const cards = [
    { card: { id: 'new-1' }, isDuplicate: false },
    { card: { id: 'copy-1' }, isDuplicate: true },
    { card: { id: 'new-2' }, isDuplicate: false },
    { card: { id: 'replace-1' }, isDuplicate: true }
  ];
  const selected = new Set(['new-1', 'new-2']);
  const actions = new Map([
    ['copy-1', { action: 'add-copy', matchingCardId: 'existing-1' }],
    ['replace-1', { action: 'replace', matchingCardId: 'existing-2' }]
  ]);
  const actionSnapshot = JSON.stringify([...actions]);

  setAllNewCardSelection(cards, selected, false);
  assert.deepEqual([...selected], []);
  assert.equal(JSON.stringify([...actions]), actionSnapshot);

  setAllNewCardSelection(cards, selected, true);
  assert.deepEqual([...selected], ['new-1', 'new-2']);
  assert.equal(JSON.stringify([...actions]), actionSnapshot);
  ['all', 'duplicates', 'nonduplicates'].forEach((filter) => visiblePreviewCards(cards, filter));
  assert.equal(JSON.stringify([...actions]), actionSnapshot);
});

test('Phase 5 destination changes restore cards that are nonduplicates again', () => {
  const source = fs.readFileSync(path.join(root, 'js/pages/decks-page.js'), 'utf8');
  const start = source.indexOf('function reconcileNewCardSelection');
  const end = source.indexOf('function updateImportDuplicateMetadata');
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ result: null });
  vm.runInContext(`${source.slice(start, end)}\nresult = reconcileNewCardSelection;`, context);
  const reconcileNewCardSelection = context.result;
  const cards = [{ card: { id: 'changing' }, isDuplicate: false }, { card: { id: 'deselected' }, isDuplicate: false }];
  const selected = new Set(['changing']);

  const duplicateDestination = [{ card: { id: 'changing' }, isDuplicate: true }, { card: { id: 'deselected' }, isDuplicate: false }];
  reconcileNewCardSelection(cards, duplicateDestination, selected);
  assert.deepEqual([...selected], []);

  const newDestination = [{ card: { id: 'changing' }, isDuplicate: false }, { card: { id: 'deselected' }, isDuplicate: false }];
  reconcileNewCardSelection(duplicateDestination, newDestination, selected);
  assert.deepEqual([...selected], ['changing']);
});

test('transfer file validation accepts valid JSON and rejects invalid input without mutation', async () => {
  const recall = loadRecall();
  const transfer = recall.RecallDeckTransfer.createTransfer(sourceDeck('Transfer', [card('one', 'one', 'one')]));
  const valid = new File([JSON.stringify(transfer)], 'transfer.recall.json', { type: 'application/json' });
  const parsed = await recall.RecallDeckTransfer.readImportFile(valid);
  assert.equal(parsed.deck.title, 'Transfer');
  assert.equal(parsed.deck.cards.length, 1);

  await assert.rejects(() => recall.RecallDeckTransfer.readImportFile(new File([], 'empty.recall.json', { type: 'application/json' })), /empty/);
  await assert.rejects(() => recall.RecallDeckTransfer.readImportFile(new File(['{'], 'broken.recall.json', { type: 'application/json' })), /malformed/);
  const missing = JSON.parse(JSON.stringify(transfer));
  delete missing.deck.cards[0].meaning;
  await assert.rejects(() => recall.RecallDeckTransfer.readImportFile(new File([JSON.stringify(missing)], 'missing.recall.json', { type: 'application/json' })), /must contain exactly/);
  await assert.rejects(() => recall.RecallDeckTransfer.readImportFile(new File([JSON.stringify(transfer)], 'wrong.txt', { type: 'text/plain' })), /Recall JSON or CSV/);
});

test('persistence failure leaves canonical and serialized decks unchanged', () => {
  const recall = loadRecall();
  const storage = recall.RecallDeckStorage;
  const destination = storage.createDeck({ title: 'Persistence', description: 'Test', language: 'Japanese', level: 'Test' });
  const beforeCanonical = JSON.stringify(storage.getAllDecks());
  const beforeSerialized = recall.localStorage.getItem(storage.STORAGE_KEY);
  recall.localStorage.setItem = () => { throw new Error('Storage unavailable'); };

  const incoming = card('incoming', 'new', 'new');
  assert.throws(() => storage.importSelectedCards(sourceDeck('Failure', [incoming]), [incoming], { mode: 'existing', deckId: destination.id }), /Storage unavailable/);
  assert.equal(JSON.stringify(storage.getAllDecks()), beforeCanonical);
  assert.equal(recall.localStorage.getItem(storage.STORAGE_KEY), beforeSerialized);
});
