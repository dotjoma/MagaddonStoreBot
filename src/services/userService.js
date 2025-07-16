const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const { v5: uuidv5 } = require('uuid');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const saltRounds = 12;
const DISCORD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // UUID namespace for Discord IDs

async function createUser({ id, email, username, password, growid = null, role = 'customer', is_active = true, total_orders = 0, total_spent = 0.00 }) {
  // Check if email or username already exists
  const { data: existingEmail } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingEmail) throw new Error('Email is already registered.');

  const { data: existingUsername } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (existingUsername) throw new Error('Username is already taken.');

  const hashedPassword = await bcrypt.hash(password, saltRounds);
  const insertObj = {
    email,
    username,
    password: hashedPassword,
    growid,
    role,
    is_active,
    total_orders,
    total_spent
  };
  if (id) {
    // Convert Discord ID to UUID v5 using a namespace
    insertObj.id = uuidv5(String(id), DISCORD_NAMESPACE);
  }
  const { data: newUser, error: insertError } = await supabase
    .from('users')
    .insert(insertObj)
    .select('id, email, username, growid, role, is_active, total_orders, total_spent, created_at')
    .single();
  if (insertError) throw insertError;
  return newUser;
}

async function setGrowID(userId, growid) {
  const { v5: uuidv5 } = require('uuid');
  const DISCORD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  // Convert Discord ID to UUID v5
  const uuidId = uuidv5(String(userId), DISCORD_NAMESPACE);
  const { data, error } = await supabase
    .from('users')
    .update({ growid })
    .eq('id', uuidId)
    .select('id, email, username, growid, updated_at')
    .single();
  if (error) throw error;
  return data;
}

async function getUserBalance(discordId) {
  const uuidId = uuidv5(String(discordId), DISCORD_NAMESPACE);
  const { data, error } = await supabase
    .from('users')
    .select('username, world_lock, total_spent, growid')
    .eq('id', uuidId)
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  createUser,
  setGrowID,
  getUserBalance
};