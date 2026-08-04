(() => {
const { createDeck, deleteDeck, loadDecks, updateDeck } = window.RecallDeckStorage;
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
let editingDeckId = null;
let deletingDeckId = null;

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
    actions.append(study, actionButton('Edit', 'edit-deck'), actionButton('Delete', 'delete-deck'));
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

  if (editingDeckId) {
    updateDeck(editingDeckId, metadata);
    closeDeckDialog();
    renderDecks();
    announce('Deck updated.');
    return;
  }

  const createdDeck = createDeck(metadata);
  location.assign(`study.html?deck=${encodeURIComponent(createdDeck.id)}`);
}
function openDeleteDialog(id) { const deck = loadDecks().find((item) => item.id === id); if (!deck) return; deletingDeckId = id; deleteDescription.textContent = `“${deck.title}” and its ${deck.cards.length} ${deck.cards.length === 1 ? 'card' : 'cards'} will be removed from this browser. This cannot be undone.`; deleteDialog.showModal(); }
function closeDeleteDialog() { deleteDialog.close(); deletingDeckId = null; }
function confirmDelete(event) { event.preventDefault(); if (!deletingDeckId) return; deleteDeck(deletingDeckId); closeDeleteDialog(); renderDecks(); announce('Deck deleted.'); }

document.querySelectorAll('#create-deck, #nav-create-deck, #empty-create-deck').forEach((button) => button.addEventListener('click', openCreateDialog));
document.querySelector('#close-deck-dialog').addEventListener('click', closeDeckDialog); document.querySelector('#cancel-deck-dialog').addEventListener('click', closeDeckDialog); form.addEventListener('submit', saveDeck);
grid.addEventListener('click', (event) => { const tile = event.target.closest('.deck-tile'); if (!tile) return; if (event.target.closest('.edit-deck')) openEditDialog(tile.dataset.deckId); if (event.target.closest('.delete-deck')) openDeleteDialog(tile.dataset.deckId); });
document.querySelector('#close-delete-deck').addEventListener('click', closeDeleteDialog); document.querySelector('#cancel-delete-deck').addEventListener('click', closeDeleteDialog); document.querySelector('#delete-deck-form').addEventListener('submit', confirmDelete);
[dialog, deleteDialog].forEach((item) => item.addEventListener('click', (event) => { if (event.target === item) item.close(); }));
initializeNavigation(); renderDecks();
})();
