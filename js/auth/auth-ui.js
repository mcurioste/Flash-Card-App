import {
  confirmAccount,
  createAccount,
  getSignedInUser,
  signInWithEmail,
  signOutCurrentUser
} from './cognito.js';

const PENDING_EMAIL_KEY = 'recallPendingConfirmationEmail';
const header = document.querySelector('.site-header, .study-header');

if (header) initializeAuthUi();

function initializeAuthUi() {
  const authButton = document.createElement('button');
  authButton.className = 'auth-control';
  authButton.type = 'button';
  authButton.textContent = 'Account';
  authButton.setAttribute('aria-haspopup', 'dialog');

  const navigation = header.querySelector('.site-nav');
  if (navigation) {
    const primaryAction = navigation.querySelector('.button');
    navigation.insertBefore(authButton, primaryAction);
  } else {
    header.insertBefore(authButton, header.querySelector('.exit-link'));
  }

  const dialog = buildAuthDialog();
  document.body.append(dialog);

  const signInForm = dialog.querySelector('#auth-sign-in-form');
  const signUpForm = dialog.querySelector('#auth-sign-up-form');
  const confirmForm = dialog.querySelector('#auth-confirm-form');
  const message = dialog.querySelector('#auth-message');
  const title = dialog.querySelector('#auth-dialog-title');
  const intro = dialog.querySelector('#auth-dialog-intro');
  const tabs = dialog.querySelector('.auth-tabs');
  const accountView = dialog.querySelector('#auth-account-view');
  const accountEmail = dialog.querySelector('#auth-account-email');
  let currentUser = null;

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('error', isError);
  }

  function setBusy(form, busy) {
    form.querySelectorAll('button, input').forEach((control) => {
      control.disabled = busy;
    });
    form.setAttribute('aria-busy', String(busy));
  }

  function showMode(mode, announcement = '') {
    setMessage(announcement);
    const signedIn = mode === 'account';
    tabs.hidden = signedIn || mode === 'confirm';
    accountView.hidden = !signedIn;
    signInForm.hidden = mode !== 'sign-in';
    signUpForm.hidden = mode !== 'sign-up';
    confirmForm.hidden = mode !== 'confirm';

    if (mode === 'account') {
      title.textContent = 'Your account';
      intro.textContent = 'You are signed in to Recall.';
      accountEmail.textContent = currentUser?.email || currentUser?.username || '';
    } else if (mode === 'confirm') {
      title.textContent = 'Check your email';
      intro.textContent = 'Enter the verification code Cognito emailed to you.';
      confirmForm.elements.email.value = pendingEmail();
    } else {
      title.textContent = mode === 'sign-up' ? 'Create an account' : 'Welcome back';
      intro.textContent =
        mode === 'sign-up'
          ? 'Use your email and a password to create your Recall account.'
          : 'Sign in to your Recall account.';
      dialog.querySelectorAll('[data-auth-mode]').forEach((tab) => {
        const selected = tab.dataset.authMode === mode;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
      });
    }

    const activeForm = dialog.querySelector('.auth-form:not([hidden])');
    activeForm?.querySelector('input:not([type="hidden"])')?.focus();
  }

  async function refreshUser() {
    try {
      currentUser = await getSignedInUser();
      authButton.textContent = currentUser ? currentUser.email : 'Sign in';
      authButton.classList.toggle('signed-in', Boolean(currentUser));
      return currentUser;
    } catch {
      currentUser = null;
      authButton.textContent = 'Sign in';
      return null;
    }
  }

  authButton.addEventListener('click', async () => {
    header.querySelector('.site-nav')?.classList.remove('open');
    header.querySelector('.menu-button')?.setAttribute('aria-expanded', 'false');
    setMessage('');
    await refreshUser();
    dialog.showModal();
    showMode(currentUser ? 'account' : pendingEmail() ? 'confirm' : 'sign-in');
  });

  dialog.querySelector('#close-auth-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.querySelectorAll('[data-auth-mode]').forEach((tab) => {
    tab.addEventListener('click', () => showMode(tab.dataset.authMode));
  });

  dialog.querySelector('#change-confirmation-email').addEventListener('click', () => {
    clearPendingEmail();
    showMode('sign-up');
  });

  signUpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('');
    const data = new FormData(signUpForm);
    const email = data.get('email');
    setBusy(signUpForm, true);

    try {
      const result = await createAccount(email, data.get('password'));
      if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        savePendingEmail(email);
        showMode('confirm', 'We sent a verification code to your email.');
      } else if (result.isSignUpComplete) {
        clearPendingEmail();
        signInForm.elements.email.value = email;
        showMode('sign-in', 'Your account is ready. Sign in to continue.');
      } else {
        setMessage('Cognito requested an unsupported sign-up step.', true);
      }
    } catch (error) {
      setMessage(friendlyAuthError(error), true);
    } finally {
      setBusy(signUpForm, false);
    }
  });

  confirmForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('');
    const data = new FormData(confirmForm);
    setBusy(confirmForm, true);

    try {
      const result = await confirmAccount(data.get('email'), data.get('code'));
      if (!result.isSignUpComplete) {
        setMessage('Cognito requested another confirmation step.', true);
        return;
      }
      const email = data.get('email');
      clearPendingEmail();
      signInForm.elements.email.value = email;
      confirmForm.reset();
      showMode('sign-in', 'Email verified. You can now sign in.');
    } catch (error) {
      setMessage(friendlyAuthError(error), true);
    } finally {
      setBusy(confirmForm, false);
    }
  });

  signInForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('');
    const data = new FormData(signInForm);
    setBusy(signInForm, true);

    try {
      const result = await signInWithEmail(data.get('email'), data.get('password'));
      if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
        savePendingEmail(data.get('email'));
        showMode('confirm', 'Verify your email before signing in.');
        return;
      }
      if (!result.isSignedIn) {
        setMessage('This account requires a sign-in step that Recall does not support yet.', true);
        return;
      }
      signInForm.reset();
      await refreshUser();
      dialog.close();
    } catch (error) {
      setMessage(friendlyAuthError(error), true);
    } finally {
      setBusy(signInForm, false);
    }
  });

  dialog.querySelector('#auth-sign-out').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    setMessage('');
    try {
      await signOutCurrentUser();
      await refreshUser();
      dialog.close();
    } catch (error) {
      setMessage(friendlyAuthError(error), true);
    } finally {
      button.disabled = false;
    }
  });

  refreshUser();
}

function buildAuthDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'auth-dialog';
  dialog.setAttribute('aria-labelledby', 'auth-dialog-title');
  dialog.innerHTML = `
    <div class="auth-dialog-content">
      <div class="auth-heading">
        <div>
          <p class="eyebrow"><span></span>Recall account</p>
          <h2 id="auth-dialog-title">Welcome back</h2>
        </div>
        <button class="dialog-close" id="close-auth-dialog" type="button" aria-label="Close account dialog">&times;</button>
      </div>
      <p class="auth-intro" id="auth-dialog-intro">Sign in to your Recall account.</p>
      <div class="auth-tabs" role="tablist" aria-label="Account options">
        <button class="active" data-auth-mode="sign-in" type="button" role="tab" aria-selected="true">Sign in</button>
        <button data-auth-mode="sign-up" type="button" role="tab" aria-selected="false">Create account</button>
      </div>
      <form class="auth-form" id="auth-sign-in-form">
        <label>Email<input name="email" type="email" maxlength="254" autocomplete="email" required /></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
        <button class="button auth-submit" type="submit">Sign in</button>
      </form>
      <form class="auth-form" id="auth-sign-up-form" hidden>
        <label>Email<input name="email" type="email" maxlength="254" autocomplete="email" required /></label>
        <label>Password<input name="password" type="password" autocomplete="new-password" required /></label>
        <p class="auth-password-note">Use a password that meets your Cognito user pool's password policy.</p>
        <button class="button auth-submit" type="submit">Create account</button>
      </form>
      <form class="auth-form" id="auth-confirm-form" hidden>
        <label>Email<input name="email" type="email" maxlength="254" autocomplete="email" required /></label>
        <label>Verification code<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" required /></label>
        <button class="button auth-submit" type="submit">Verify email</button>
        <button class="auth-text-button" id="change-confirmation-email" type="button">Use a different email</button>
      </form>
      <div class="auth-account-view" id="auth-account-view" hidden>
        <p>Signed in as <strong id="auth-account-email"></strong></p>
        <button class="button auth-submit" id="auth-sign-out" type="button">Sign out</button>
      </div>
      <p class="auth-message" id="auth-message" aria-live="polite"></p>
    </div>`;
  return dialog;
}

function friendlyAuthError(error) {
  const messages = {
    UsernameExistsException: 'An account with this email already exists. Try signing in instead.',
    InvalidPasswordException: 'That password does not meet the account password requirements.',
    InvalidParameterException: 'Check the email and password requirements, then try again.',
    CodeMismatchException: 'That verification code is incorrect. Check the code and try again.',
    ExpiredCodeException: 'That verification code has expired. Please create the account again to request a new code.',
    NotAuthorizedException: 'The email or password is incorrect.',
    UserNotFoundException: 'The email or password is incorrect.',
    UserNotConfirmedException: 'Verify your email before signing in.',
    LimitExceededException: 'Too many attempts. Wait a little while, then try again.',
    TooManyRequestsException: 'Too many attempts. Wait a little while, then try again.',
    UserAlreadyAuthenticatedException: 'You are already signed in.'
  };

  if (messages[error?.name]) return messages[error.name];
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return 'Recall could not reach Cognito. Check your connection and try again.';
  }
  return 'Authentication could not be completed. Please try again.';
}

function pendingEmail() {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

function savePendingEmail(email) {
  try {
    sessionStorage.setItem(PENDING_EMAIL_KEY, String(email).trim().toLowerCase());
  } catch {
    // The confirmation form remains usable when session storage is unavailable.
  }
}

function clearPendingEmail() {
  try {
    sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    // Nothing else is needed when session storage is unavailable.
  }
}
