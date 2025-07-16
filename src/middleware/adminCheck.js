function isAdmin(member) {
  if (!member) return false;
  // Check for Discord 'Administrator' permission
  return member.permissions && member.permissions.has('Administrator');
}

module.exports = { isAdmin }; 