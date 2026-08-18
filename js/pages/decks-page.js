(() => {
const { CHANGE_EVENT, createDeck, deleteDeck, getAllDecks, getDeckById, getCardDuplicateMetadata, importSelectedCards, refreshDecks, updateDeck } = window.RecallDeckStorage;
const { MAX_CARDS, exportDeck, readImportFile } = window.RecallDeckTransfer;
const { initializeNavigation } = window.RecallNavigation;

const grid = document.querySelector('#deck-grid');
const emptyState = document.querySelector('#empty-state');
const status = document.querySelector('#page-status');
const dialog = document.querySelector('#deck-dialog');
const form = document.querySelector('#deck-form');
const formTitle = document.querySelector('#deck-dialog-title');
const formMessage = document.querySelector('#deck-form-message');
const deleteDialog = document.querySelector('#delete-deck-dialog');
const deleteDescription = document.querySelector('#delete-deck-description');
const exportDialog = document.querySelector('#export-deck-dialog');
const exportForm = document.querySelector('#export-deck-form');
const exportMessage = document.querySelector('#export-form-message');
const exportDescription = document.querySelector('#export-destination-description');
const exportSubmit = document.querySelector('#confirm-export-deck');
const fileInput = document.querySelector('#deck-file-input');
const importDialog = document.querySelector('#import-review-dialog');
const importForm = document.querySelector('#import-review-form');
const importSummary = document.querySelector('#import-review-summary');
const importCount = document.querySelector('#import-selected-count');
const importCardList = document.querySelector('#import-card-list');
const importFilterAllCount = document.querySelector('#import-filter-all-count');
const importFilterDuplicateCount = document.querySelector('#import-filter-duplicate-count');
const importFilterNonduplicateCount = document.querySelector('#import-filter-nonduplicate-count');
const importCardListLegend = importCardList.querySelector('legend');
const importName = document.querySelector('#import-deck-name');
const existingDeckSelect = document.querySelector('#existing-deck-select');
const importMessage = document.querySelector('#import-review-message');
const importSubmit = document.querySelector('#confirm-import-cards');
let editingDeckId = null;
let deletingDeckId = null;
let exportingDeckId = null;
let pendingImport = null;
const importedCardTargets = new Map();

function announce(message) { status.textContent = ''; requestAnimationFrame(() => { status.textContent = message; }); }
function deckMetadata(formData) { return Object.fromEntries(['title', 'description', 'language', 'level'].map((key) => [key, String(formData.get(key)).trim()])); }

function renderDecks() {
  const decks = getAllDecks();
  grid.replaceChildren();
  emptyState.hidden = decks.length > 0;
  grid.hidden = decks.length === 0;
  decks.forEach((deck) => {
    const article = document.createElement('article'); article.className = 'deck-tile'; article.dataset.deckId = deck.id;
    const meta = document.createElement('p'); meta.className = 'deck-meta'; meta.textContent = `${deck.language} · ${deck.level}`;
    const title = document.createElement('h2'); title.textContent = deck.title;
    const description = document.createElement('p'); description.className = 'deck-description'; description.textContent = deck.description || 'No description yet.';
    const count = document.createElement('p'); count.className = 'deck-count'; count.textContent = `${deck.cards.length} ${deck.cards.length === 1 ? 'card' : 'cards'}`;
    const actions = document.createElement('div'); actions.className = 'deck-tile-actions';
    const study = document.createElement('a'); study.className = 'button study-deck-link';
    const importedCardId = importedCardTargets.get(deck.id);
    study.href = `study.html?deck=${encodeURIComponent(deck.id)}${importedCardId ? `&card=${encodeURIComponent(importedCardId)}` : ''}`; study.textContent = 'Study';
    actions.append(study, actionButton('Export', 'export-deck'), actionButton('Edit', 'edit-deck'), actionButton('Delete', 'delete-deck'));
    article.append(meta, title, description, count, actions); grid.append(article);
  });
}

function actionButton(label, className) { const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label; return button; }
function openCreateDialog() { editingDeckId = null; form.reset(); formMessage.textContent = ''; formTitle.textContent = 'Create deck'; dialog.showModal(); form.elements.title.focus(); }
function openEditDialog(id) { const deck = getDeckById(id); if (!deck) return; editingDeckId = id; formTitle.textContent = 'Edit deck'; formMessage.textContent = ''; ['title', 'description', 'language', 'level'].forEach((field) => { form.elements[field].value = deck[field]; }); dialog.showModal(); form.elements.title.focus(); }
function closeDeckDialog() { dialog.close(); editingDeckId = null; }
function saveDeck(event) {
  event.preventDefault();
  const metadata = deckMetadata(new FormData(form));
  if (Object.values(metadata).some((value) => !value)) { formMessage.textContent = 'Please complete every field.'; return; }

  try {
    if (editingDeckId) {
      const updatedDeck = updateDeck(editingDeckId, metadata);
      if (!updatedDeck) { formMessage.textContent = 'A deck with this title already exists.'; return; }
      closeDeckDialog();
      renderDecks();
      announce('Deck updated.');
      return;
    }

    const createdDeck = createDeck(metadata);
    if (!createdDeck) { formMessage.textContent = 'A deck with this title already exists.'; return; }
    location.assign(`study.html?deck=${encodeURIComponent(createdDeck.id)}`);
  } catch (error) { formMessage.textContent = error?.message || 'The deck could not be saved.'; }
}
function openDeleteDialog(id) { const deck = getDeckById(id); if (!deck) return; deletingDeckId = id; deleteDescription.textContent = `“${deck.title}” and its ${deck.cards.length} ${deck.cards.length === 1 ? 'card' : 'cards'} will be removed from this browser. This cannot be undone.`; deleteDialog.showModal(); }
function closeDeleteDialog() { deleteDialog.close(); deletingDeckId = null; }
function confirmDelete(event) { event.preventDefault(); if (!deletingDeckId) return; deleteDeck(deletingDeckId); closeDeleteDialog(); renderDecks(); announce('Deck deleted.'); }
function exportDestinationMode() {
  let mobileShare = false;
  try { mobileShare = Boolean(matchMedia('(pointer: coarse)').matches && navigator.share && navigator.canShare?.({ files: [new File([''], 'recall.txt', { type: 'text/plain' })] })); } catch { mobileShare = false; }
  if (mobileShare) return 'share';
  if ('showSaveFilePicker' in window) return 'save';
  return 'download';
}
function openExportDialog(id) {
  if (!getDeckById(id)) return;
  exportingDeckId = id; exportForm.reset(); exportMessage.textContent = '';
  const mode = exportDestinationMode();
  exportDescription.textContent = mode === 'share' ? 'Choose a format, then select a destination from your device’s share menu.' : mode === 'save' ? 'Choose a format, then select where to save the file.' : 'Choose a format to download the file. Your browser’s download settings control whether you are asked where to save it.';
  exportSubmit.textContent = mode === 'share' ? 'Choose destination' : mode === 'save' ? 'Choose save location' : 'Download file';
  exportDialog.showModal();
}
function closeExportDialog() { exportDialog.close(); exportingDeckId = null; }
async function submitExport(event) {
  event.preventDefault();
  const deck = getDeckById(exportingDeckId);
  if (!deck) { exportMessage.textContent = 'This deck is no longer available.'; return; }
  const submit = exportForm.querySelector('[type="submit"]');
  submit.disabled = true; exportMessage.textContent = 'Preparing your file…';
  try {
    const format = new FormData(exportForm).get('export-format');
    const result = await exportDeck(deck, format);
    closeExportDialog();
    announce(result === 'shared' ? 'Deck sent to your chosen destination.' : result === 'saved' ? 'Deck saved to your chosen location.' : 'Deck download started. Your browser controls the download location.');
  } catch (error) {
    exportMessage.textContent = error?.name === 'AbortError' ? '' : error?.message || 'The deck could not be exported.';
  } finally { submit.disabled = false; }
}
async function handleImport(event) {
  const [file] = event.target.files;
  if (!file) return;
  announce('Checking the selected file…');
  try {
    const transfer = await readImportFile(file);
    if (transfer.deck.cards.length === 0) throw new Error('The imported deck does not contain any cards.');
    beginImportReview(transfer.deck);
    announce(`“${transfer.deck.title}” is ready to review. Nothing has been imported yet.`);
  } catch (error) { announce(`Import blocked: ${error?.message || 'the file is invalid.'}`); }
  finally { fileInput.value = ''; }
}

function appendImportField(list, label, value) {
  if (!value) return;
  const row = document.createElement('div');
  const term = document.createElement('dt'); term.textContent = label;
  const description = document.createElement('dd'); description.textContent = value;
  row.append(term, description); list.append(row);
}

function duplicateFirstPreviewCards(cards) {
  return [...cards.filter((item) => item.isDuplicate), ...cards.filter((item) => !item.isDuplicate)];
}

function visiblePreviewCards(cards, filter) {
  const ordered = duplicateFirstPreviewCards(cards);
  if (filter === 'duplicates') return ordered.filter((item) => item.isDuplicate);
  if (filter === 'nonduplicates') return ordered.filter((item) => !item.isDuplicate);
  return ordered;
}

function renderImportCards(cards) {
  const fragment = document.createDocumentFragment();
  const visibleCards = visiblePreviewCards(cards, pendingImport.filter);
  visibleCards.forEach((item) => {
    const { card } = item;
    const row = document.createElement(item.isDuplicate ? 'div' : 'label'); row.className = `import-card-option${item.isDuplicate ? ' import-card-option-duplicate' : ''}`;
    const content = document.createElement('span'); content.className = 'import-card-content';
    const word = document.createElement('strong'); word.textContent = card.word;
    const fields = document.createElement('dl'); fields.className = 'import-card-fields';
    appendImportField(fields, 'Reading', card.reading); appendImportField(fields, 'Type', card.type); appendImportField(fields, 'Meaning', card.meaning); appendImportField(fields, 'Example', card.example); appendImportField(fields, 'Translation', card.translation);
    content.append(word);
    if (item.isDuplicate) {
      const duplicate = document.createElement('span'); duplicate.className = 'import-duplicate-status'; duplicate.textContent = 'Duplicate — matches an existing card';
      const actionLabel = document.createElement('label'); actionLabel.className = 'import-duplicate-action'; actionLabel.textContent = 'Import action';
      const select = document.createElement('select'); select.className = 'import-duplicate-action-select'; select.dataset.cardId = card.id; select.setAttribute('aria-label', `Import action for duplicate card ${card.word}`);
      [['skip', 'Skip'], ['add-copy', 'Add copy'], ['replace', 'Replace existing card']].forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); });
      select.value = pendingImport.duplicateActions.get(card.id)?.action ?? 'skip';
      actionLabel.append(select); content.append(duplicate, actionLabel);
      row.append(document.createElement('span'), content);
    } else {
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'import-card-checkbox'; checkbox.dataset.cardId = card.id; checkbox.checked = pendingImport.selectedCardIds.has(card.id);
      row.append(checkbox, content);
    }
    content.append(fields); fragment.append(row);
  });
  if (visibleCards.length === 0) {
    const empty = document.createElement('p'); empty.className = 'import-filter-empty';
    empty.textContent = pendingImport.filter === 'duplicates' ? 'No duplicate cards were found in this import.' : pendingImport.filter === 'nonduplicates' ? 'No nonduplicate cards were found in this import.' : 'No cards are available in this import.';
    fragment.append(empty);
  }
  importCardList.replaceChildren(importCardListLegend, fragment);
}

function renderImportFilterCounts() {
  const duplicateCount = pendingImport.cards.filter((item) => item.isDuplicate).length;
  importFilterAllCount.textContent = `(${pendingImport.cards.length})`;
  importFilterDuplicateCount.textContent = `(${duplicateCount})`;
  importFilterNonduplicateCount.textContent = `(${pendingImport.cards.length - duplicateCount})`;
}

function renderExistingDeckOptions() {
  const fragment = document.createDocumentFragment();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a deck'; fragment.append(placeholder);
  getAllDecks().forEach((deck) => { const option = document.createElement('option'); const limit = deck.maxCards === null ? MAX_CARDS : Math.min(deck.maxCards, MAX_CARDS); const available = Math.max(0, limit - deck.cards.length); option.value = deck.id; option.textContent = `${deck.title} (${deck.cards.length} cards · ${available} spaces available)`; fragment.append(option); });
  existingDeckSelect.replaceChildren(fragment);
}

function selectedDestinationMode() { return importForm.elements['import-destination'].value; }
function updateImportDuplicateMetadata() {
  if (!pendingImport) return;
  const deckId = selectedDestinationMode() === 'existing' ? existingDeckSelect.value : null;
  const metadata = getCardDuplicateMetadata(deckId, pendingImport.deck.cards);
  pendingImport.cards = pendingImport.deck.cards.map((card, index) => ({ card, ...metadata[index] }));
  const nextActions = new Map();
  pendingImport.cards.forEach((item) => {
    if (!item.isDuplicate) return;
    pendingImport.selectedCardIds.delete(item.card.id);
    const previous = pendingImport.duplicateActions.get(item.card.id);
    nextActions.set(item.card.id, previous?.matchingCardId === item.matchingCardId ? previous : { action: 'skip', matchingCardId: item.matchingCardId });
  });
  pendingImport.duplicateActions = nextActions;
  renderImportFilterCounts();
  renderImportCards(pendingImport.cards);
}
function updateImportControls() {
  if (!pendingImport) return;
  const chosenDuplicates = [...pendingImport.duplicateActions.values()].filter((decision) => decision.action !== 'skip').length;
  const selected = pendingImport.selectedCardIds.size + chosenDuplicates;
  const total = pendingImport.deck.cards.length;
  const mode = selectedDestinationMode();
  const creating = mode === 'new';
  importName.disabled = !creating; importName.required = creating;
  existingDeckSelect.disabled = creating; existingDeckSelect.required = !creating;
  importCount.textContent = `${selected} of ${total} ${total === 1 ? 'card' : 'cards'} selected`;
  importSubmit.disabled = selected === 0 || (creating ? !importName.value.trim() : !existingDeckSelect.value);
}

function beginImportReview(deck) {
  pendingImport = { deck, cards: [], selectedCardIds: new Set(deck.cards.map((card) => card.id)), duplicateActions: new Map(), filter: 'all' };
  importForm.reset(); importName.value = deck.title; importMessage.textContent = '';
  importSummary.textContent = `Uploaded deck: “${deck.title}” · ${deck.cards.length} ${deck.cards.length === 1 ? 'valid card' : 'valid cards'}`;
  renderExistingDeckOptions(); updateImportDuplicateMetadata(); updateImportControls(); importDialog.showModal(); importName.focus();
}

function setAllNewCardSelection(cards, selectedCardIds, selected) {
  selectedCardIds.clear();
  if (selected) cards.filter((item) => !item.isDuplicate).forEach((item) => { selectedCardIds.add(item.card.id); });
}

function setAllImportCards(selected) {
  if (!pendingImport) return;
  setAllNewCardSelection(pendingImport.cards, pendingImport.selectedCardIds, selected);
  importCardList.querySelectorAll('.import-card-checkbox').forEach((checkbox) => { checkbox.checked = selected; });
  importMessage.textContent = ''; updateImportControls();
}

function cancelImportReview() {
  pendingImport = null; importForm.reset(); importCardList.replaceChildren(); importMessage.textContent = '';
  if (importDialog.open) importDialog.close();
}

function confirmImport(event) {
  event.preventDefault();
  if (!pendingImport) return;
  const selectedCards = pendingImport.deck.cards.filter((card) => pendingImport.selectedCardIds.has(card.id) || pendingImport.duplicateActions.has(card.id));
  const duplicateActions = [...pendingImport.duplicateActions].map(([cardId, decision]) => ({ cardId, ...decision }));
  const mode = selectedDestinationMode();
  if (selectedCards.length === 0) { importMessage.textContent = 'Select at least one card to import.'; updateImportControls(); return; }
  const destination = mode === 'new' ? { mode, title: importName.value } : { mode, deckId: existingDeckSelect.value };
  importSubmit.disabled = true; importMessage.textContent = 'Importing selected cards…';
  try {
    const result = importSelectedCards(pendingImport.deck, selectedCards, destination, duplicateActions);
    const title = result.deck.title; const count = result.importedCount;
    if (result.importedCardIds[0]) importedCardTargets.set(result.deck.id, result.importedCardIds[0]);
    cancelImportReview(); renderDecks(); announce(result.created ? `${count} ${count === 1 ? 'card' : 'cards'} imported into new deck “${title}”.` : `Import complete for “${title}”: ${result.nonduplicateAdded} new, ${result.copiesAdded} copied, ${result.replacedCount} replaced, ${result.skippedCount} skipped.`);
  } catch (error) { importMessage.textContent = error?.message || 'The selected cards could not be imported.'; updateImportControls(); }
}

document.querySelectorAll('#create-deck, #nav-create-deck, #empty-create-deck').forEach((button) => button.addEventListener('click', openCreateDialog));
document.querySelector('#import-deck').addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', handleImport);
document.querySelector('#select-all-import-cards').addEventListener('click', () => setAllImportCards(true)); document.querySelector('#deselect-all-import-cards').addEventListener('click', () => setAllImportCards(false));
document.querySelector('#close-import-review').addEventListener('click', cancelImportReview); document.querySelector('#cancel-import-review').addEventListener('click', cancelImportReview); importForm.addEventListener('submit', confirmImport);
importCardList.addEventListener('change', (event) => { if (!pendingImport || !event.target.matches('.import-card-checkbox')) return; const cardId = event.target.dataset.cardId; if (!pendingImport.deck.cards.some((card) => card.id === cardId)) return; if (event.target.checked) pendingImport.selectedCardIds.add(cardId); else pendingImport.selectedCardIds.delete(cardId); importMessage.textContent = ''; updateImportControls(); });
importCardList.addEventListener('change', (event) => { if (!pendingImport || !event.target.matches('.import-duplicate-action-select')) return; const decision = pendingImport.duplicateActions.get(event.target.dataset.cardId); if (!decision) return; pendingImport.duplicateActions.set(event.target.dataset.cardId, { ...decision, action: event.target.value }); importMessage.textContent = ''; updateImportControls(); });
importForm.addEventListener('change', (event) => { if (!pendingImport || event.target.name !== 'import-filter') return; pendingImport.filter = event.target.value; renderImportCards(pendingImport.cards); });
importForm.addEventListener('change', (event) => { if (event.target.name === 'import-destination') { importMessage.textContent = ''; updateImportDuplicateMetadata(); updateImportControls(); } }); importName.addEventListener('input', updateImportControls); existingDeckSelect.addEventListener('change', () => { updateImportDuplicateMetadata(); updateImportControls(); });
document.querySelector('#close-deck-dialog').addEventListener('click', closeDeckDialog); document.querySelector('#cancel-deck-dialog').addEventListener('click', closeDeckDialog); form.addEventListener('submit', saveDeck);
grid.addEventListener('click', (event) => { const tile = event.target.closest('.deck-tile'); if (!tile) return; if (event.target.closest('.export-deck')) openExportDialog(tile.dataset.deckId); if (event.target.closest('.edit-deck')) openEditDialog(tile.dataset.deckId); if (event.target.closest('.delete-deck')) openDeleteDialog(tile.dataset.deckId); });
document.querySelector('#close-delete-deck').addEventListener('click', closeDeleteDialog); document.querySelector('#cancel-delete-deck').addEventListener('click', closeDeleteDialog); document.querySelector('#delete-deck-form').addEventListener('submit', confirmDelete);
document.querySelector('#close-export-deck').addEventListener('click', closeExportDialog); document.querySelector('#cancel-export-deck').addEventListener('click', closeExportDialog); exportForm.addEventListener('submit', submitExport);
[dialog, deleteDialog, exportDialog].forEach((item) => item.addEventListener('click', (event) => { if (event.target === item) item.close(); }));
importDialog.addEventListener('click', (event) => { if (event.target === importDialog) cancelImportReview(); }); importDialog.addEventListener('cancel', (event) => { event.preventDefault(); cancelImportReview(); }); importDialog.addEventListener('close', () => { if (pendingImport) cancelImportReview(); });
window.addEventListener(CHANGE_EVENT, (event) => { if (event.detail?.external) renderDecks(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) { refreshDecks(); renderDecks(); } });
initializeNavigation(); renderDecks();
if (location.protocol === 'file:') announce('Recall must be opened through a local web server. Direct file mode cannot share deck storage with the Study page.');
})();
