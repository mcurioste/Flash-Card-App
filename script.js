const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('.site-nav');
const studyCard = document.querySelector('#study-card');
const revealButton = document.querySelector('#reveal-button');

menuButton.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

navigation.addEventListener('click', (event) => {
  if (event.target.matches('a')) {
    navigation.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }
});

function toggleAnswer() {
  const isRevealed = studyCard.classList.toggle('revealed');
  revealButton.querySelector('span').textContent = isRevealed ? 'Hide' : 'Reveal';
}

revealButton.addEventListener('click', toggleAnswer);

document.querySelector('#year').textContent = new Date().getFullYear();
