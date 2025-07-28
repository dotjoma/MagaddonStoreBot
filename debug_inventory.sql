-- Debug script to check inventory status
-- Run this in your Supabase SQL editor to diagnose the issue

-- Check all products and their inventory counts
SELECT 
  p.id as product_id,
  p.name as product_name,
  p.code as product_code,
  COUNT(i.id) as total_inventory,
  COUNT(CASE WHEN i.is_sold = false THEN 1 END) as available_inventory,
  COUNT(CASE WHEN i.is_sold = true THEN 1 END) as sold_inventory
FROM products p
LEFT JOIN inventory i ON p.id = i.product_id
GROUP BY p.id, p.name, p.code
ORDER BY p.id;

-- Check specific inventory items for a product (replace PRODUCT_ID with actual ID)
-- SELECT 
--   i.id,
--   i.product_id,
--   i.data,
--   i.is_sold,
--   i.sold_at,
--   i.created_at
-- FROM inventory i
-- WHERE i.product_id = PRODUCT_ID
-- ORDER BY i.created_at DESC;

-- Check if there are any inventory items at all
SELECT COUNT(*) as total_inventory_items FROM inventory;

-- Check if there are any available (unsold) inventory items
SELECT COUNT(*) as available_inventory_items FROM inventory WHERE is_sold = false;

-- Check products with no inventory
SELECT 
  p.id,
  p.name,
  p.code
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM inventory i WHERE i.product_id = p.id
); 