import { Amplify } from 'aws-amplify';
import {
  confirmSignUp,
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  signIn,
  signOut,
  signUp
} from 'aws-amplify/auth';

export const COGNITO_REGION = 'us-east-1';
export const COGNITO_USER_POOL_ID = 'us-east-1_ujyn1i9ew';
export const COGNITO_APP_CLIENT_ID = '23tqek3mi8171qg79f8lj9kcau';

// Amplify derives the Cognito region from the region-prefixed User Pool ID.
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: COGNITO_USER_POOL_ID,
      userPoolClientId: COGNITO_APP_CLIENT_ID,
      loginWith: {
        email: true
      },
      signUpVerificationMethod: 'code',
      userAttributes: {
        email: {
          required: true
        }
      }
    }
  }
});

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

export function createAccount(email, password) {
  const username = normalizeEmail(email);
  return signUp({
    username,
    password,
    options: {
      userAttributes: { email: username }
    }
  });
}

export function confirmAccount(email, confirmationCode) {
  return confirmSignUp({
    username: normalizeEmail(email),
    confirmationCode: String(confirmationCode).trim()
  });
}

export function signInWithEmail(email, password) {
  return signIn({
    username: normalizeEmail(email),
    password
  });
}

export function signOutCurrentUser() {
  return signOut();
}

export async function getSignedInUser() {
  try {
    const [user, attributes] = await Promise.all([getCurrentUser(), fetchUserAttributes()]);
    return {
      ...user,
      email: attributes.email || user.username
    };
  } catch (error) {
    if (error?.name === 'UserUnAuthenticatedException') return null;
    throw error;
  }
}

export async function isSignedIn() {
  try {
    await getCurrentUser();
    return true;
  } catch (error) {
    if (error?.name === 'UserUnAuthenticatedException') return false;
    throw error;
  }
}

// Use this helper when Recall's cloud API starts requiring Cognito bearer tokens.
export async function getAccessToken() {
  const session = await fetchAuthSession();
  const accessToken = session.tokens?.accessToken;

  if (!accessToken) {
    throw new Error('You must sign in before making this request.');
  }

  return accessToken.toString();
}
