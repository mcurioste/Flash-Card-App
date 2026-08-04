const decks = [
  {
    id: 'basic-japanese',
    label: 'Starter deck',
    title: 'Basic',
    titleAccent: 'Japanese',
    description: 'Everyday words to begin building your vocabulary.',
    language: '日本語',
    level: 'BEGINNER',
    prompt: 'WHAT DOES THIS WORD MEAN?',
    maxCards: 19,
    cards: [
      { word: '猫', reading: 'ねこ', type: 'NOUN', meaning: 'cat', example: '猫が好きです。', translation: 'I like cats.' },
      { word: '水', reading: 'みず', type: 'NOUN', meaning: 'water', example: '水を飲みます。', translation: 'I drink water.' },
      { word: '食べる', reading: 'たべる', type: 'VERB', meaning: 'to eat', example: '朝ご飯を食べる。', translation: 'I eat breakfast.' },
      { word: '本', reading: 'ほん', type: 'NOUN', meaning: 'book', example: 'この本は面白いです。', translation: 'This book is interesting.' },
      { word: '友達', reading: 'ともだち', type: 'NOUN', meaning: 'friend', example: '友達と話します。', translation: 'I talk with a friend.' },
      { word: '学ぶ', reading: 'まなぶ', type: 'VERB', meaning: 'to learn', example: '日本語を学びます。', translation: 'I learn Japanese.' },
      { word: '懐かしい', reading: 'なつかしい', type: 'い-ADJECTIVE', meaning: 'nostalgic; fondly remembered', example: 'この歌は懐かしい。', translation: 'This song brings back memories.' },
      { word: 'こんにちは', reading: 'konnichiwa', type: 'GREETING', meaning: 'hello; good afternoon', example: 'こんにちは、田中さん。', translation: 'Hello, Tanaka.' },
      { word: 'ありがとう', reading: 'arigatō', type: 'EXPRESSION', meaning: 'thank you', example: '本当にありがとう。', translation: 'Thank you very much.' }
    ]
  }
];

const requestedDeckId = new URLSearchParams(window.location.search).get('deck');
const selectedDeck = decks.find((deck) => deck.id === requestedDeckId) || decks[0];
const cards = selectedDeck.cards;
const card = document.querySelector('#learning-card');
const revealButton = document.querySelector('#study-reveal-button');
const previousButton = document.querySelector('#previous-card');
const nextButton = document.querySelector('#next-card');
const answer = document.querySelector('#learning-answer');
const addCardButton = document.querySelector('#add-card-button');
const addCardDialog = document.querySelector('#add-card-dialog');
const addCardForm = document.querySelector('#add-card-form');
const closeAddCardButton = document.querySelector('#close-add-card');
const addCardMessage = document.querySelector('#add-card-message');
const deckCardCount = document.querySelector('#deck-card-count');
const deckCapacityMessage = document.querySelector('#deck-capacity-message');
const deleteCardButton = document.querySelector('#delete-card-button');
const deleteCardDialog = document.querySelector('#delete-card-dialog');
const deleteCardForm = document.querySelector('#delete-card-form');
const closeDeleteCardButton = document.querySelector('#close-delete-card');
const deleteCardList = document.querySelector('#delete-card-list');
const deleteCardMessage = document.querySelector('#delete-card-message');
const selectAllCards = document.querySelector('#select-all-cards');
const selectedCardCount = document.querySelector('#selected-card-count');
const confirmDeleteButton = document.querySelector('#confirm-delete-button');
let currentIndex = 0;

function renderDeck() {
  document.title = `${selectedDeck.title} ${selectedDeck.titleAccent} — Recall`;
  document.querySelector('meta[name="description"]').content = selectedDeck.description;
  document.querySelector('#deck-label').textContent = selectedDeck.label;
  document.querySelector('#deck-title').textContent = selectedDeck.title;
  document.querySelector('#deck-title-accent').textContent = selectedDeck.titleAccent;
  document.querySelector('#deck-description').textContent = selectedDeck.description;
  document.querySelector('#card-language').textContent = selectedDeck.language;
  document.querySelector('#card-level').textContent = selectedDeck.level;
  document.querySelector('#card-prompt').textContent = selectedDeck.prompt;
  deckCapacityMessage.textContent = Number.isFinite(selectedDeck.maxCards)
    ? `Complete every field. This starter deck can contain up to ${selectedDeck.maxCards} cards during this study session.`
    : 'Complete every field. This deck does not have a card limit.';
}

function renderCard() {
  if (cards.length === 0) {
    card.classList.remove('revealed');
    document.querySelector('#card-word').textContent = 'No cards';
    document.querySelector('#card-reading').textContent = '';
    document.querySelector('#card-type').textContent = 'EMPTY DECK';
    document.querySelector('#card-meaning').textContent = 'Add a card to keep studying.';
    document.querySelector('#card-example').textContent = '';
    document.querySelector('#card-translation').textContent = '';
    document.querySelector('#card-count').textContent = '00 / 00';
    document.querySelector('#progress-text').textContent = 'No cards in deck';
    document.querySelector('#progress-percent').textContent = '0%';
    document.querySelector('#progress-bar').style.width = '0%';
    revealButton.disabled = true;
    previousButton.disabled = true;
    nextButton.disabled = true;
    return;
  }

  const current = cards[currentIndex];
  const position = currentIndex + 1;
  const percentage = Math.round((position / cards.length) * 100);
  card.classList.remove('revealed');
  revealButton.textContent = 'Reveal answer';
  revealButton.setAttribute('aria-expanded', 'false');
  answer.setAttribute('aria-hidden', 'true');
  revealButton.disabled = false;
  document.querySelector('#card-word').textContent = current.word;
  document.querySelector('#card-reading').textContent = current.reading;
  document.querySelector('#card-type').textContent = current.type;
  document.querySelector('#card-meaning').textContent = current.meaning;
  document.querySelector('#card-example').textContent = current.example;
  document.querySelector('#card-translation').textContent = current.translation;
  document.querySelector('#card-count').textContent = `${String(position).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
  document.querySelector('#progress-text').textContent = `Card ${position} of ${cards.length}`;
  document.querySelector('#progress-percent').textContent = `${percentage}%`;
  document.querySelector('#progress-bar').style.width = `${percentage}%`;
  previousButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === cards.length - 1;
}

function toggleAnswer() {
  const revealed = card.classList.toggle('revealed');
  revealButton.textContent = revealed ? 'Hide answer' : 'Reveal answer';
  revealButton.setAttribute('aria-expanded', String(revealed));
  answer.setAttribute('aria-hidden', String(!revealed));
}

function moveCard(direction) {
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= cards.length) return;
  currentIndex = nextIndex;
  renderCard();
}

function updateAddCardControls() {
  const limitReached = Number.isFinite(selectedDeck.maxCards) && cards.length >= selectedDeck.maxCards;
  deckCardCount.textContent = Number.isFinite(selectedDeck.maxCards)
    ? `${cards.length} of ${selectedDeck.maxCards} cards in deck`
    : `${cards.length} cards in deck`;
  addCardButton.disabled = limitReached;
  addCardButton.textContent = limitReached ? 'Card limit reached' : '+ Add a card';
  deleteCardButton.disabled = cards.length === 0;
}

function openAddCardForm() {
  addCardMessage.textContent = '';
  addCardDialog.showModal();
  addCardForm.elements.word.focus();
}

function closeAddCardForm() {
  addCardDialog.close();
}

// These mutation functions are the storage boundary. They can later call an
// API without changing the dialogs or study-card rendering code.
function addCardToDeck(newCard) {
  cards.push(newCard);
}

function deleteCardsFromDeck(indexes) {
  [...indexes].sort((a, b) => b - a).forEach((index) => {
    cards.splice(index, 1);
  });
}

function addCard(event) {
  event.preventDefault();

  if (Number.isFinite(selectedDeck.maxCards) && cards.length >= selectedDeck.maxCards) {
    addCardMessage.textContent = `This deck has reached its ${selectedDeck.maxCards}-card limit.`;
    return;
  }

  const formData = new FormData(addCardForm);
  const newCard = {
    word: formData.get('word').trim(),
    reading: formData.get('reading').trim(),
    type: formData.get('type').trim().toUpperCase(),
    meaning: formData.get('meaning').trim(),
    example: formData.get('example').trim(),
    translation: formData.get('translation').trim()
  };

  if (Object.values(newCard).some((value) => !value)) {
    addCardMessage.textContent = 'Please complete every field before adding the card.';
    return;
  }

  addCardToDeck(newCard);
  currentIndex = cards.length - 1;
  addCardForm.reset();
  updateAddCardControls();
  closeAddCardForm();
  renderCard();
}

function getSelectedCardIndexes() {
  return [...deleteCardList.querySelectorAll('input[name="cards-to-delete"]:checked')]
    .map((input) => Number(input.value));
}

function renderDeleteCardList() {
  deleteCardList.replaceChildren();

  cards.forEach((deckCard, index) => {
    const option = document.createElement('label');
    option.className = 'delete-card-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'cards-to-delete';
    checkbox.value = String(index);

    const identity = document.createElement('span');
    const word = document.createElement('strong');
    const details = document.createElement('small');
    word.textContent = deckCard.word;
    details.textContent = `${deckCard.reading} · ${deckCard.type}`;
    identity.append(word, document.createElement('br'), details);

    const meaning = document.createElement('span');
    meaning.className = 'card-list-meaning';
    meaning.textContent = deckCard.meaning;
    option.append(checkbox, identity, meaning);
    deleteCardList.append(option);
  });
}

function updateDeleteSelection() {
  const selectedCount = getSelectedCardIndexes().length;
  selectedCardCount.textContent = `${selectedCount} ${selectedCount === 1 ? 'card' : 'cards'} selected`;
  confirmDeleteButton.disabled = selectedCount === 0;
  selectAllCards.checked = cards.length > 0 && selectedCount === cards.length;
  selectAllCards.indeterminate = selectedCount > 0 && selectedCount < cards.length;
}

function openDeleteCardForm() {
  deleteCardMessage.textContent = '';
  selectAllCards.checked = false;
  selectAllCards.indeterminate = false;
  renderDeleteCardList();
  updateDeleteSelection();
  deleteCardDialog.showModal();
}

function closeDeleteCardForm() {
  deleteCardDialog.close();
}

function deleteSelectedCards(event) {
  event.preventDefault();
  const indexes = getSelectedCardIndexes();
  if (indexes.length === 0) {
    deleteCardMessage.textContent = 'Select at least one card to delete.';
    return;
  }

  deleteCardsFromDeck(indexes);
  currentIndex = Math.min(currentIndex, Math.max(cards.length - 1, 0));
  closeDeleteCardForm();
  updateAddCardControls();
  renderCard();
}

revealButton.addEventListener('click', toggleAnswer);
previousButton.addEventListener('click', () => moveCard(-1));
nextButton.addEventListener('click', () => moveCard(1));
addCardButton.addEventListener('click', openAddCardForm);
closeAddCardButton.addEventListener('click', closeAddCardForm);
addCardForm.addEventListener('submit', addCard);
addCardDialog.addEventListener('click', (event) => {
  if (event.target === addCardDialog) closeAddCardForm();
});
deleteCardButton.addEventListener('click', openDeleteCardForm);
closeDeleteCardButton.addEventListener('click', closeDeleteCardForm);
deleteCardForm.addEventListener('submit', deleteSelectedCards);
deleteCardList.addEventListener('change', updateDeleteSelection);
selectAllCards.addEventListener('change', () => {
  deleteCardList.querySelectorAll('input[name="cards-to-delete"]').forEach((input) => {
    input.checked = selectAllCards.checked;
  });
  updateDeleteSelection();
});
deleteCardDialog.addEventListener('click', (event) => {
  if (event.target === deleteCardDialog) closeDeleteCardForm();
});
document.addEventListener('keydown', (event) => {
  if (event.target !== document.body) return;
  if (event.key === ' ') {
    event.preventDefault();
    toggleAnswer();
  } else if (event.key === 'ArrowLeft') {
    moveCard(-1);
  } else if (event.key === 'ArrowRight') {
    moveCard(1);
  }
});

renderDeck();
renderCard();
updateAddCardControls();
