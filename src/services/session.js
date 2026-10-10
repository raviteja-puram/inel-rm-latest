const CURRENT_USER_KEY = 'inel_rm_current_user';

let currentUser = readCurrentUser();

function readCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(CURRENT_USER_KEY)) || null;
  } catch {
    return null;
  }
}

export function setCurrentUser(user) {
  currentUser = user
    ? { id: user.id, username: user.username, role: user.role, name: user.name || user.username }
    : null;
  if (currentUser) localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
  else localStorage.removeItem(CURRENT_USER_KEY);
}

export function getCurrentUser() {
  return currentUser;
}

export function clearCurrentUser() {
  currentUser = null;
  localStorage.removeItem(CURRENT_USER_KEY);
  // Discard legacy browser-stored accounts and plaintext passwords.
  localStorage.removeItem('inel_rm_users');
}
