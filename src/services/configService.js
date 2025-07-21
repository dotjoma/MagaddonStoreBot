const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function setWorldName(worldName) {
  const { error } = await supabase
    .from('config')
    .upsert({ key: 'world_name', value: worldName }, { onConflict: ['key'] });
  if (error) throw error;
}

async function getWorldName() {
  const { data, error } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'world_name')
    .single();
  if (error) throw error;
  return data.value;
}

async function setOwnerName(ownerName) {
  const { error } = await supabase
    .from('config')
    .upsert({ key: 'owner_name', value: ownerName }, { onConflict: ['key'] });
  if (error) throw error;
}

async function getOwnerName() {
  const { data, error } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'owner_name')
    .single();
  if (error) throw error;
  return data.value;
}

async function setBotName(botName) {
  const { error } = await supabase
    .from('config')
    .upsert({ key: 'bot_name', value: botName }, { onConflict: ['key'] });
  if (error) throw error;
}

async function getBotName() {
  const { data, error } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'bot_name')
    .single();
  if (error) throw error;
  return data.value;
}

module.exports = {
  setWorldName,
  getWorldName,
  setOwnerName,
  getOwnerName,
  setBotName,
  getBotName
}; 