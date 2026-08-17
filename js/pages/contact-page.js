(() => {
  const { initializeNavigation } = window.RecallNavigation;
  const CONTACT_EMAIL = 'recall.main.contact@gmail.com';
  const form = document.querySelector('#contact-form');
  const status = document.querySelector('#contact-form-message');
  const year = document.querySelector('#year');

  if (year) year.textContent = new Date().getFullYear();
  initializeNavigation();
  if (!form || !status) return;

  const showStatus = (text, success = false) => {
    status.textContent = text;
    status.classList.toggle('success', success);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const email = String(data.get('email') || '').trim();
    const topic = String(data.get('topic') || '').trim();
    const message = String(data.get('message') || '').trim();

    if (!name || !email || !topic || !message) {
      showStatus('Please complete every field before sending.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStatus('Please enter a valid email address.');
      return;
    }

    const subject = encodeURIComponent(`Recall contact: ${topic} — ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nTopic: ${topic}\n\n${message}`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    showStatus('Your email app should open with the message ready to send.', true);
    form.reset();
  });
})();
