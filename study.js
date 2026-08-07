(() => {
const { addCard, deleteCards, getDeckById, updateCard } = window.RecallDeckStorage;
const $ = (s) => document.querySelector(s);
const deckId = new URLSearchParams(location.search).get('deck');
let deck = deckId ? getDeckById(deckId) : null;
let cards = deck?.cards ?? [], index = 0, editingId = null;
let mode = 'flashcards', answered = false, selectedChoice = null, correctAnswers = 0, attempts = 0, streak = 0;
const card = $('#learning-card'), answer = $('#learning-answer'), reveal = $('#study-reveal-button');
const previous = $('#previous-card'), next = $('#next-card'), add = $('#add-card-button'), edit = $('#edit-card-button'), remove = $('#delete-card-button');
const addDialog = $('#add-card-dialog'), editListDialog = $('#edit-card-list-dialog'), editDialog = $('#edit-card-dialog'), deleteDialog = $('#delete-card-dialog');
const addForm = $('#add-card-form'), editForm = $('#edit-card-form');
const choiceTest = $('#choice-test'), choiceSubmit = $('#choice-submit-button'), feedback = $('#test-feedback');
const fields = ['word', 'reading', 'type', 'meaning', 'example', 'translation'];
const shuffle = (items) => { const copy = [...items]; for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
function refresh() { deck = getDeckById(deckId); cards = deck?.cards ?? []; if ($('#shuffle-cards')?.checked) cards = shuffle(cards); }
function close(dialog) { if (dialog.open) dialog.close(); }
function formValues(form) { const data = new FormData(form); return Object.fromEntries(fields.map((field) => [field, String(data.get(field)).trim()])); }
function hideAnswer() { card.classList.remove('revealed'); reveal.textContent = 'Reveal answer'; reveal.setAttribute('aria-expanded', 'false'); answer.setAttribute('aria-hidden', 'true'); }
function updateScore() { $('#score-value').textContent = `${correctAnswers} / ${attempts}`; $('#streak-value').textContent = streak; }
function resetQuestion() { answered = false; selectedChoice = null; feedback.textContent = ''; feedback.className = 'test-feedback'; choiceSubmit.textContent = 'Submit answer'; choiceSubmit.disabled = true; }
function buildChoices(current) {
  choiceTest.replaceChildren();
  const distractors = shuffle(cards.filter((item) => item.id !== current.id)).slice(0, 3);
  shuffle([current, ...distractors]).forEach((item) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'choice-option'; button.textContent = item.meaning; button.dataset.correct = String(item.id === current.id); button.setAttribute('aria-pressed', 'false'); choiceTest.append(button); });
}
function markAnswer(correct) {
  if (answered) return;
  answered = true; attempts += 1; correctAnswers += Number(correct); streak = correct ? streak + 1 : 0; updateScore();
  feedback.textContent = correct ? 'Correct!' : `Not quite. The answer is “${cards[index].meaning}”.`;
  feedback.className = `test-feedback ${correct ? 'correct' : 'incorrect'}`;
  choiceSubmit.textContent = 'Next card'; choiceSubmit.disabled = false;
}
function renderMode() {
  if (mode === 'choice' && cards.length < 4) { mode = 'flashcards'; document.querySelector('input[name="study-mode"][value="flashcards"]').checked = true; $('#mode-message').textContent = '4 choices was stopped because this deck now has fewer than 4 cards.'; }
  const testing = mode !== 'flashcards';
  choiceTest.hidden = mode !== 'choice' || !cards.length;
  choiceSubmit.hidden = mode !== 'choice' || !cards.length;
  $('#test-score').hidden = !testing; answer.hidden = testing; reveal.hidden = testing;
  $('.card-navigation').hidden = testing;
  if (testing && cards.length) { resetQuestion(); if (mode === 'choice') buildChoices(cards[index]); }
}
function controls() { const empty = !cards.length, full = Number.isFinite(deck?.maxCards) && cards.length >= deck.maxCards; reveal.disabled = empty; previous.disabled = empty || index === 0; next.disabled = empty || index === cards.length - 1; edit.disabled = empty; remove.disabled = empty; add.disabled = full; add.textContent = full ? 'Card limit reached' : '+ Add a card'; $('#deck-card-count').textContent = Number.isFinite(deck?.maxCards) ? `${cards.length} of ${deck.maxCards} cards in deck` : `${cards.length} cards in deck`; }
function renderCard() {
  hideAnswer();
  if (!cards.length) { $('#card-word').textContent = 'No cards yet'; $('#card-reading').textContent = ''; $('#card-type').textContent = 'EMPTY DECK'; $('#card-meaning').textContent = 'Add a card to begin studying.'; $('#card-example').textContent = ''; $('#card-translation').textContent = ''; $('#card-count').textContent = '00 / 00'; $('#progress-text').textContent = 'No cards in deck'; $('#progress-percent').textContent = '0%'; $('#progress-bar').style.width = '0%'; controls(); renderMode(); return; }
  index = Math.min(index, cards.length - 1); const current = cards[index], position = index + 1, percent = Math.round(position / cards.length * 100);
  fields.forEach((field) => { const target = $(`#card-${field}`); if (target) target.textContent = current[field]; });
  $('#card-count').textContent = `${String(position).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`; $('#progress-text').textContent = `Card ${position} of ${cards.length}`; $('#progress-percent').textContent = `${percent}%`; $('#progress-bar').style.width = `${percent}%`; controls();
  renderMode();
}
function renderDeck() { if (!deck) { $('#study-content').hidden = true; $('#deck-not-found').hidden = false; return; } document.title = `${deck.title} — Recall`; $('meta[name="description"]').content = deck.description; $('#deck-label').textContent = `${deck.language} · ${deck.level}`; $('#deck-title').textContent = deck.title; $('#deck-title-accent').textContent = ''; $('#deck-description').textContent = deck.description; $('#card-language').textContent = deck.language; $('#card-level').textContent = deck.level; $('#card-prompt').textContent = deck.prompt; document.querySelectorAll('[data-dialog-deck-name]').forEach((node) => { node.textContent = deck.title; }); renderCard(); }
function toggle() { if (!cards.length) return; const shown = !card.classList.contains('revealed'); card.classList.toggle('revealed', shown); reveal.textContent = shown ? 'Hide answer' : 'Reveal answer'; reveal.setAttribute('aria-expanded', String(shown)); answer.setAttribute('aria-hidden', String(!shown)); }
function changeMode(nextMode) {
  if (nextMode === 'choice' && cards.length < 4) { $('#mode-message').textContent = 'You need at least 4 cards in this deck to use 4 choices.'; document.querySelector('input[name="study-mode"][value="flashcards"]').checked = true; mode = 'flashcards'; }
  else { mode = nextMode; $('#mode-message').textContent = ''; }
  index = 0; renderCard();
}
function chooseAnswer(event) {
  const button = event.target.closest('.choice-option');
  if (!button || answered) return;
  choiceTest.querySelectorAll('.choice-option').forEach((option) => { option.classList.remove('selected'); option.setAttribute('aria-pressed', 'false'); });
  selectedChoice = button; button.classList.add('selected'); button.setAttribute('aria-pressed', 'true'); choiceSubmit.disabled = false;
}
function submitChoice() {
  if (answered) { advanceTest(); return; }
  if (!selectedChoice) return;
  const correct = selectedChoice.dataset.correct === 'true';
  choiceTest.querySelectorAll('.choice-option').forEach((option) => { option.disabled = true; if (option.dataset.correct === 'true') option.classList.add('correct'); });
  if (!correct) selectedChoice.classList.add('incorrect');
  markAnswer(correct);
}
function advanceTest() {
  if (!answered) return;
  index = (index + 1) % cards.length; renderCard();
}
function toggleShuffle(event) {
  if (event.target.checked) cards = shuffle(cards);
  else { refresh(); }
  index = 0;
  renderCard();
}
function move(amount) { if (!cards.length) return; const target = index + amount; if (target < 0 || target >= cards.length) return; index = target; renderCard(); }
function openAdd() { if (!deck || add.disabled) return; addForm.reset(); $('#add-card-message').textContent = ''; $('#deck-capacity-message').textContent = Number.isFinite(deck.maxCards) ? `Complete every field. This deck can contain up to ${deck.maxCards} cards.` : 'Complete every field.'; addDialog.showModal(); addForm.elements.word.focus(); }
function saveAdd(event) { event.preventDefault(); const values = formValues(addForm); if (Object.values(values).some((value) => !value)) { $('#add-card-message').textContent = 'Please complete every field.'; return; } if (Number.isFinite(deck.maxCards) && cards.length >= deck.maxCards) return; const savedCard = addCard(deckId, { ...values, type: values.type.toUpperCase() }); if (!savedCard) { $('#add-card-message').textContent = 'A card with this word and reading already exists in this deck.'; return; } refresh(); index = cards.length - 1; close(addDialog); renderCard(); }
function renderEditList() { const list = $('#edit-card-list'); list.replaceChildren(); cards.forEach((item) => { const row = document.createElement('article'); row.className = 'edit-card-option'; const summary = document.createElement('div'); summary.className = 'edit-card-summary'; const word = document.createElement('strong'); word.textContent = item.word; const details = document.createElement('small'); details.textContent = `${item.reading} · ${item.type}`; const meaning = document.createElement('p'); meaning.textContent = `${item.meaning} — ${item.example} / ${item.translation}`; summary.append(word, document.createElement('br'), details, meaning); const button = document.createElement('button'); button.type = 'button'; button.className = 'edit-one-card-button'; button.dataset.cardId = item.id; button.textContent = 'Edit'; button.setAttribute('aria-label', `Edit ${item.word}`); row.append(summary, button); list.append(row); }); }
function openEditList() { if (!cards.length) return; renderEditList(); editListDialog.showModal(); }
function openEdit(id) { const item = cards.find((candidate) => candidate.id === id); if (!item) return; editingId = id; fields.forEach((field) => { editForm.elements[field].value = item[field]; }); $('#edit-card-message').textContent = ''; close(editListDialog); editDialog.showModal(); editForm.elements.word.focus(); }
function saveEdit(event) { event.preventDefault(); if (!editingId) return; const values = formValues(editForm); if (Object.values(values).some((value) => !value)) { $('#edit-card-message').textContent = 'Please complete every field.'; return; } const updatedCard = updateCard(deckId, editingId, { ...values, type: values.type.toUpperCase() }); if (!updatedCard) { $('#edit-card-message').textContent = 'A card with this word and reading already exists in this deck.'; return; } refresh(); index = Math.max(0, cards.findIndex((item) => item.id === editingId)); editingId = null; close(editDialog); renderCard(); }
function selectedIds() { return [...$('#delete-card-list').querySelectorAll('input:checked')].map((input) => input.value); }
function updateSelection() { const count = selectedIds().length; $('#selected-card-count').textContent = `${count} ${count === 1 ? 'card' : 'cards'} selected`; $('#confirm-delete-button').disabled = !count; $('#select-all-cards').checked = cards.length > 0 && count === cards.length; $('#select-all-cards').indeterminate = count > 0 && count < cards.length; }
function openDelete() { if (!cards.length) return; const list = $('#delete-card-list'); list.replaceChildren(); cards.forEach((item) => { const label = document.createElement('label'); label.className = 'delete-card-option'; const input = document.createElement('input'); input.type = 'checkbox'; input.name = 'cards-to-delete'; input.value = item.id; const identity = document.createElement('span'); const word = document.createElement('strong'); word.textContent = item.word; const details = document.createElement('small'); details.textContent = `${item.reading} · ${item.type}`; identity.append(word, document.createElement('br'), details); const meaning = document.createElement('span'); meaning.className = 'card-list-meaning'; meaning.textContent = item.meaning; label.append(input, identity, meaning); list.append(label); }); $('#delete-card-message').textContent = ''; updateSelection(); deleteDialog.showModal(); }
function deleteSelected(event) { event.preventDefault(); const ids = selectedIds(); if (!ids.length) return; deleteCards(deckId, ids); refresh(); index = Math.min(index, Math.max(cards.length - 1, 0)); close(deleteDialog); renderCard(); }
reveal.addEventListener('click', () => { if (mode === 'flashcards') toggle(); else advanceTest(); }); previous.addEventListener('click', () => move(-1)); next.addEventListener('click', () => move(1)); add.addEventListener('click', openAdd); addForm.addEventListener('submit', saveAdd); edit.addEventListener('click', openEditList); editForm.addEventListener('submit', saveEdit); remove.addEventListener('click', openDelete); $('#delete-card-form').addEventListener('submit', deleteSelected);
document.querySelectorAll('input[name="study-mode"]').forEach((input) => input.addEventListener('change', () => changeMode(input.value)));
choiceTest.addEventListener('click', chooseAnswer);
choiceSubmit.addEventListener('click', submitChoice);
$('#shuffle-cards').addEventListener('change', toggleShuffle);
$('#edit-card-list').addEventListener('click', (event) => { const button = event.target.closest('.edit-one-card-button'); if (button) openEdit(button.dataset.cardId); }); $('#delete-card-list').addEventListener('change', updateSelection); $('#select-all-cards').addEventListener('change', (event) => { $('#delete-card-list').querySelectorAll('input').forEach((input) => { input.checked = event.target.checked; }); updateSelection(); });
[['#close-add-card',addDialog],['#close-edit-card-list',editListDialog],['#close-edit-card',editDialog],['#close-delete-card',deleteDialog]].forEach(([selector, dialog]) => $(selector).addEventListener('click', () => close(dialog))); $('#back-to-edit-list').addEventListener('click', () => { close(editDialog); editingId = null; openEditList(); }); [addDialog, editListDialog, editDialog, deleteDialog].forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) close(dialog); }));
document.addEventListener('keydown', (event) => { const blocked = document.activeElement?.matches('input, textarea, select, button, [contenteditable="true"]') || $('dialog[open]'); if (blocked || mode !== 'flashcards') return; if (event.key === ' ') { if (!cards.length) return; event.preventDefault(); toggle(); } else if (event.key === 'ArrowLeft') move(-1); else if (event.key === 'ArrowRight') move(1); });
renderDeck();
})();
