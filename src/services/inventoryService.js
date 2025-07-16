const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function getAllInventory() {
  const { data, error } = await supabase
    .from('inventory')
    .select('product_id, is_sold');
  if (error) throw error;
  return data;
}

// Get an available (unsold) inventory item for a product
async function getAvailableInventoryItem(product_id) {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('product_id', product_id)
    .eq('is_sold', false)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Mark an inventory item as sold
async function markInventoryItemAsSold(id) {
  const { data, error } = await supabase
    .from('inventory')
    .update({ is_sold: true, sold_at: new Date().toISOString() })
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Count available (unsold) inventory items for a product
async function getStockForProduct(product_id) {
  const { count, error } = await supabase
    .from('inventory')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', product_id)
    .eq('is_sold', false);
  if (error) throw error;
  return count;
}

module.exports = {
  getAllInventory,
  getAvailableInventoryItem,
  markInventoryItemAsSold,
  getStockForProduct
}; 