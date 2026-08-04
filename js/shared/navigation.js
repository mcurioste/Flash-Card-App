window.RecallNavigation = { initializeNavigation };

function initializeNavigation() {
  const button = document.querySelector('.menu-button');
  const navigation = document.querySelector('.site-nav');
  if (!button || !navigation) return;

  const close = (returnFocus = false) => {
    navigation.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus) button.focus();
  };
  button.addEventListener('click', () => {
    const open = navigation.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
  });
  navigation.addEventListener('click', (event) => { if (event.target.closest('a')) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && navigation.classList.contains('open')) close(true); });
  window.addEventListener('resize', () => { if (window.matchMedia('(min-width: 901px)').matches) close(); });
}
