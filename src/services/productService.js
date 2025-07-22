const { createClient } = require('@supabase/supabase-js');
const { getAllInventory, getStockForProduct } = require('./inventoryService');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function getAllProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*');
  if (error) throw error;
  return data;
}

async function getProductById(id) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function createProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .insert([product])
    .single();
  if (error) throw error;
  return data;
}

async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function deleteProduct(id) {
  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Get all products with their stock from the inventory table
async function getAllProductsWithStock() {
  // Fetch all products
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('*');
  if (productsError) throw productsError;

  // Fetch all unsold inventory items
  const { data: inventoryItems, error: inventoryError } = await supabase
    .from('inventory')
    .select('product_id')
    .eq('is_sold', false);
  if (inventoryError) throw inventoryError;

  // Count available inventory for each product
  const stockMap = {};
  for (const item of inventoryItems) {
    stockMap[item.product_id] = (stockMap[item.product_id] || 0) + 1;
  }

  // Attach stock and image to each product
  return products.map(product => ({
    ...product,
    stock: stockMap[product.id] || 0,
    image: product.image || null // include image if present
  }));
}

async function getTotalProducts() {
  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });
  return count || 0;
}

async function getActiveListings() {
  const products = await getAllProductsWithStock();
  return products.filter(p => p.stock > 0).length;
}

async function getRevenueToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isoToday = today.toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select('total_amount, created_at')
    .gte('created_at', isoToday);
  if (error) throw error;
  return data.reduce((sum, order) => sum + Number(order.total_amount), 0);
}

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProductsWithStock,
  getTotalProducts,
  getActiveListings,
  getRevenueToday
}; 