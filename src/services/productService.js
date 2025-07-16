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
  const products = await getAllProducts();
  // For each product, count available inventory
  const productsWithStock = await Promise.all(products.map(async (product) => {
    const stock = await getStockForProduct(product.id);
    return { ...product, stock };
  }));
  return productsWithStock;
}

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProductsWithStock
}; 