(() => {
const { createDeck, deleteDeck, importDeck, loadDecks, updateDeck } = window.RecallDeckStorage;
const { exportDeck, readImportFile } = window.RecallDeckTransfer;
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
let editingDeckId = null;
let deletingDeckId = null;
let exportingDeckId = null;

function announce(message) { status.textContent = ''; requestAnimationFrame(() => { status.textContent = message; }); }
function deckMetadata(formData) { return Object.fromEntries(['title', 'description', 'language', 'level'].map((key) => [key, String(formData.get(key)).trim()])); }

function renderDecks() {
  const decks = loadDecks();
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
    const study = document.createElement('a'); study.className = 'button study-deck-link'; study.href = `study.html?deck=${encodeURIComponent(deck.id)}`; study.textContent = 'Study';
    actions.append(study, actionButton('Export', 'export-deck'), actionButton('Edit', 'edit-deck'), actionButton('Delete', 'delete-deck'));
    article.append(meta, title, description, count, actions); grid.append(article);
  });
}

function actionButton(label, className) { const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label; return button; }
function openCreateDialog() { editingDeckId = null; form.reset(); formMessage.textContent = ''; formTitle.textContent = 'Create deck'; dialog.showModal(); form.elements.title.focus(); }
function openEditDialog(id) { const deck = loadDecks().find((item) => item.id === id); if (!deck) return; editingDeckId = id; formTitle.textContent = 'Edit deck'; formMessage.textContent = ''; ['title', 'description', 'language', 'level'].forEach((field) => { form.elements[field].value = deck[field]; }); dialog.showModal(); form.elements.title.focus(); }
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
function openDeleteDialog(id) { const deck = loadDecks().find((item) => item.id === id); if (!deck) return; deletingDeckId = id; deleteDescription.textContent = `“${deck.title}” and its ${deck.cards.length} ${deck.cards.length === 1 ? 'card' : 'cards'} will be removed from this browser. This cannot be undone.`; deleteDialog.showModal(); }
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
  if (!loadDecks().some((deck) => deck.id === id)) return;
  exportingDeckId = id; exportForm.reset(); exportMessage.textContent = '';
  const mode = exportDestinationMode();
  exportDescription.textContent = mode === 'share' ? 'Choose a format, then select a destination from your device’s share menu.' : mode === 'save' ? 'Choose a format, then select where to save the file.' : 'Choose a format to download the file. Your browser’s download settings control whether you are asked where to save it.';
  exportSubmit.textContent = mode === 'share' ? 'Choose destination' : mode === 'save' ? 'Choose save location' : 'Download file';
  exportDialog.showModal();
}
function closeExportDialog() { exportDialog.close(); exportingDeckId = null; }
async function submitExport(event) {
  event.preventDefault();
  const deck = loadDecks().find((item) => item.id === exportingDeckId);
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
    const saved = importDeck(transfer.deck);
    if (!saved) throw new Error('A deck with this title or identifier already exists. Remove it or change the export before importing.');
    renderDecks(); announce(`“${saved.title}” imported with ${saved.cards.length} ${saved.cards.length === 1 ? 'card' : 'cards'}.`);
  } catch (error) { announce(`Import blocked: ${error?.message || 'the file is invalid.'}`); }
  finally { fileInput.value = ''; }
}

document.querySelectorAll('#create-deck, #nav-create-deck, #empty-create-deck').forEach((button) => button.addEventListener('click', openCreateDialog));
document.querySelector('#import-deck').addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', handleImport);
document.querySelector('#close-deck-dialog').addEventListener('click', closeDeckDialog); document.querySelector('#cancel-deck-dialog').addEventListener('click', closeDeckDialog); form.addEventListener('submit', saveDeck);
grid.addEventListener('click', (event) => { const tile = event.target.closest('.deck-tile'); if (!tile) return; if (event.target.closest('.export-deck')) openExportDialog(tile.dataset.deckId); if (event.target.closest('.edit-deck')) openEditDialog(tile.dataset.deckId); if (event.target.closest('.delete-deck')) openDeleteDialog(tile.dataset.deckId); });
document.querySelector('#close-delete-deck').addEventListener('click', closeDeleteDialog); document.querySelector('#cancel-delete-deck').addEventListener('click', closeDeleteDialog); document.querySelector('#delete-deck-form').addEventListener('submit', confirmDelete);
document.querySelector('#close-export-deck').addEventListener('click', closeExportDialog); document.querySelector('#cancel-export-deck').addEventListener('click', closeExportDialog); exportForm.addEventListener('submit', submitExport);
[dialog, deleteDialog, exportDialog].forEach((item) => item.addEventListener('click', (event) => { if (event.target === item) item.close(); }));
initializeNavigation(); renderDecks();
})();
