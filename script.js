(() => {
const { initializeNavigation } = window.RecallNavigation;
const studyCard = document.querySelector('#study-card');
const revealButton = document.querySelector('#reveal-button');

function toggleDemoAnswer() {
  const shown = studyCard.classList.toggle('revealed');
  revealButton.querySelector('span').textContent = shown ? 'Hide' : 'Reveal';
  revealButton.setAttribute('aria-expanded', String(shown));
  document.querySelector('#answer').setAttribute('aria-hidden', String(!shown));
}

revealButton.setAttribute('aria-controls', 'answer');
revealButton.setAttribute('aria-expanded', 'false');
document.querySelector('#answer').setAttribute('aria-hidden', 'true');
revealButton.addEventListener('click', toggleDemoAnswer);

document.querySelector('#year').textContent = new Date().getFullYear();
initializeNavigation();
})();
