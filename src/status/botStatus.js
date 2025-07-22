// type: 0 for Playing
// type: 1 for Streaming (requires a url field for Twitch/YouTube)
// type: 2 for Listening
// type: 3 for Watching
// type: 4 for Custom (use state instead of name)
// type: 5 for Competing

function setBotStatusAndActivity(client) {
  const guildName = client.guilds.cache.first()?.name;
  client.user.setPresence({
    status: 'dnd',
    activities: [{ name: guildName || 'the shop', type: 3 }],
  });
}

module.exports = { setBotStatusAndActivity }; 