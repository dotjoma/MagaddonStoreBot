const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function getOrderCount() {
  const { count, error } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

async function createOrder(orderData) {
  const { data, error } = await supabase
    .from('orders')
    .insert([orderData])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getOrderById(id) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function getOrdersByUserId(userId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getTotalRevenue() {
  const { data, error } = await supabase
    .from('orders')
    .select('total_amount');
  if (error) throw error;
  return data.reduce((sum, order) => sum + Number(order.total_amount), 0);
}

async function getRevenueToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isoToday = today.toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select('total_amount')
    .gte('created_at', isoToday);
  if (error) throw error;
  return data.reduce((sum, order) => sum + Number(order.total_amount), 0);
}

module.exports = {
  getOrderCount,
  createOrder,
  getOrderById,
  getOrdersByUserId,
  getTotalRevenue,
  getRevenueToday
}; 