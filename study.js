const cards = [
  { word: '猫', reading: 'ねこ', type: 'NOUN', meaning: 'cat', example: '猫が好きです。', translation: 'I like cats.' },
  { word: '水', reading: 'みず', type: 'NOUN', meaning: 'water', example: '水を飲みます。', translation: 'I drink water.' },
  { word: '食べる', reading: 'たべる', type: 'VERB', meaning: 'to eat', example: '朝ご飯を食べる。', translation: 'I eat breakfast.' },
  { word: '本', reading: 'ほん', type: 'NOUN', meaning: 'book', example: 'この本は面白いです。', translation: 'This book is interesting.' },
  { word: '友達', reading: 'ともだち', type: 'NOUN', meaning: 'friend', example: '友達と話します。', translation: 'I talk with a friend.' },
  { word: '学ぶ', reading: 'まなぶ', type: 'VERB', meaning: 'to learn', example: '日本語を学びます。', translation: 'I learn Japanese.' },
  { word: '懐かしい', reading: 'なつかしい', type: 'い-ADJECTIVE', meaning: 'nostalgic; fondly remembered', example: 'この歌は懐かしい。', translation: 'This song brings back memories.' },
  { word: 'こんにちは', reading: 'konnichiwa', type: 'GREETING', meaning: 'hello; good afternoon', example: 'こんにちは、田中さん。', translation: 'Hello, Tanaka.' },
  { word: 'ありがとう', reading: 'arigatō', type: 'EXPRESSION', meaning: 'thank you', example: '本当にありがとう。', translation: 'Thank you very much.' }
];
const card = document.querySelector('#learning-card');
const revealButton = document.querySelector('#study-reveal-button');
const previousButton = document.querySelector('#previous-card');
const nextButton = document.querySelector('#next-card');
const answer = document.querySelector('#learning-answer');
let currentIndex = 0;

function renderCard() {
  const current = cards[currentIndex];
  const position = currentIndex + 1;
  const percentage = Math.round((position / cards.length) * 100);
  card.classList.remove('revealed');
  revealButton.textContent = 'Reveal answer';
  revealButton.setAttribute('aria-expanded', 'false');
  answer.setAttribute('aria-hidden', 'true');
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
revealButton.addEventListener('click', toggleAnswer);
previousButton.addEventListener('click', () => moveCard(-1));
nextButton.addEventListener('click', () => moveCard(1));
document.addEventListener('keydown', (event) => {
  if (event.key === ' ' && event.target === document.body) { event.preventDefault(); toggleAnswer(); }
  else if (event.key === 'ArrowLeft') moveCard(-1);
  else if (event.key === 'ArrowRight') moveCard(1);
});
renderCard();
