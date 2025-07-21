const AUTHORIZED_USER_IDS = process.env.AUTHORIZED_USERS
  ? process.env.AUTHORIZED_USERS.split(',').map(id => id.trim())
  : [];

function isAuthorizedUser(userId) {
  return AUTHORIZED_USER_IDS.includes(String(userId));
}

module.exports = { isAuthorizedUser }; 