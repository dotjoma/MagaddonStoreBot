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
async function getAllProductsWithStock(retryCount = 0) {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second

  try {
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
  } catch (error) {
    // Check if it's a network-related error
    const isNetworkError = error.message?.includes('fetch failed') || 
                          error.message?.includes('network') ||
                          error.message?.includes('ECONNRESET') ||
                          error.message?.includes('ETIMEDOUT') ||
                          error.message?.includes('ENOTFOUND');

    if (isNetworkError && retryCount < maxRetries) {
      console.warn(`[ProductService] Network error (attempt ${retryCount + 1}/${maxRetries}): ${error.message}. Retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1))); // Exponential backoff
      return getAllProductsWithStock(retryCount + 1);
    }

    // Log the error with more details
    console.error('[ProductService] Failed to fetch products with stock:', {
      error: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details,
      retryCount,
      timestamp: new Date().toISOString()
    });

    // Return empty array as fallback to prevent crashes
    return [];
  }
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

// Health check function to test Supabase connectivity
async function checkSupabaseHealth() {
  try {
    const startTime = Date.now();
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .limit(1);
    
    const responseTime = Date.now() - startTime;
    
    if (error) {
      return {
        status: 'error',
        message: error.message,
        code: error.code,
        hint: error.hint,
        responseTime
      };
    }
    
    return {
      status: 'healthy',
      message: 'Supabase connection is working',
      responseTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
      code: error.code,
      hint: error.hint,
      timestamp: new Date().toISOString()
    };
  }
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
  getRevenueToday,
  checkSupabaseHealth
}; 