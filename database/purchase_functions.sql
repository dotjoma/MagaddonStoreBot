-- Purchase transaction functions for atomic operations
-- This prevents race conditions and ensures data consistency

-- Function to process a purchase transaction atomically
CREATE OR REPLACE FUNCTION process_purchase_transaction(
  p_user_id UUID,
  p_product_id INTEGER,
  p_quantity INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_product RECORD;
  v_user RECORD;
  v_inventory_items JSON;
  v_total_price DECIMAL(10,2);
  v_order_number VARCHAR(50);
  v_inventory_ids INTEGER[];
  v_item RECORD;
  v_counter INTEGER := 0;
BEGIN
  -- Start transaction
  BEGIN
    -- Get product information with FOR UPDATE to lock the row
    SELECT * INTO v_product 
    FROM products 
    WHERE id = p_product_id 
    FOR UPDATE;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found';
    END IF;
    
    -- Get user information with FOR UPDATE to lock the row
    SELECT * INTO v_user 
    FROM users 
    WHERE id = p_user_id 
    FOR UPDATE;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Check available inventory
    SELECT COUNT(*) INTO v_counter
    FROM inventory 
    WHERE product_id = p_product_id 
    AND is_sold = false;
    
    IF v_counter < p_quantity THEN
      RAISE EXCEPTION 'Insufficient inventory. Available: %, Requested: %', v_counter, p_quantity;
    END IF;
    
    -- Calculate total price
    v_total_price := (v_product.price * p_quantity);
    
    -- Check user balance
    IF (v_user.world_lock < v_total_price) THEN
      RAISE EXCEPTION 'Insufficient balance. Required: %, Available: %', v_total_price, v_user.world_lock;
    END IF;
    
    -- Get available inventory items
    SELECT ARRAY_AGG(id) INTO v_inventory_ids
    FROM (
      SELECT id 
      FROM inventory 
      WHERE product_id = p_product_id 
      AND is_sold = false 
      LIMIT p_quantity
      FOR UPDATE
    ) AS available_items;
    
    -- Mark inventory items as sold
    UPDATE inventory 
    SET is_sold = true, sold_at = NOW() 
    WHERE id = ANY(v_inventory_ids);
    
    -- Deduct balance and add to total spent
    UPDATE users 
    SET world_lock = world_lock - v_total_price,
        total_spent = total_spent + v_total_price
    WHERE id = p_user_id;
    
    -- Generate order number
    v_order_number := 'ORD-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 10);
    
    -- Create order record
    INSERT INTO orders (
      user_id, 
      product_id, 
      inventory_id, 
      order_number, 
      quantity, 
      unit_price, 
      total_amount, 
      status, 
      payment_method, 
      notes
    ) VALUES (
      p_user_id,
      p_product_id,
      v_inventory_ids[1],
      v_order_number,
      p_quantity,
      v_product.price,
      v_total_price,
      'completed',
      'world_lock',
      'Purchase completed via Discord bot'
    );
    
    -- Get inventory items for return
    SELECT json_agg(
      json_build_object(
        'id', id,
        'data', data
      )
    ) INTO v_inventory_items
    FROM inventory 
    WHERE id = ANY(v_inventory_ids);

    -- Debug: Log the inventory items
    RAISE NOTICE 'v_inventory_ids: %', v_inventory_ids;
    RAISE NOTICE 'v_inventory_items: %', v_inventory_items;

    -- Patch: Ensure v_inventory_items is always a valid JSON array
    -- json_agg returns NULL if no rows, so we need to handle that
    IF v_inventory_items IS NULL THEN
      v_inventory_items := '[]'::json;
    END IF;
    
    -- Debug: Log the final inventory items
    RAISE NOTICE 'Final v_inventory_items: %', v_inventory_items;
    
    -- Return transaction data
    RETURN json_build_object(
      'product', json_build_object(
        'id', COALESCE(v_product.id, 0),
        'name', COALESCE(v_product.name, ''),
        'price', COALESCE(v_product.price, 0)
      ),
      'inventory_items', v_inventory_items,
      'total_price', COALESCE(v_total_price, 0),
      'order_number', COALESCE(v_order_number, '')
    );
    
  EXCEPTION
    WHEN OTHERS THEN
      -- Rollback transaction on any error
      RAISE;
  END;
END;
$$ LANGUAGE plpgsql;

-- Function to rollback a purchase transaction
CREATE OR REPLACE FUNCTION rollback_purchase_transaction(
  p_user_id UUID,
  p_product_id INTEGER,
  p_quantity INTEGER,
  p_order_number VARCHAR(50)
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Start transaction
  BEGIN
    -- Delete the order
    DELETE FROM orders WHERE order_number = p_order_number;
    
    -- Refund the user's balance
    UPDATE users 
    SET world_lock = world_lock + (SELECT total_amount FROM orders WHERE order_number = p_order_number),
        total_spent = total_spent - (SELECT total_amount FROM orders WHERE order_number = p_order_number)
    WHERE id = p_user_id;
    
    -- Mark inventory items as available again
    UPDATE inventory 
    SET is_sold = false, sold_at = NULL 
    WHERE id IN (
      SELECT id 
      FROM inventory 
      WHERE product_id = p_product_id 
      AND is_sold = true 
      ORDER BY sold_at DESC 
      LIMIT p_quantity
    );
    
    RETURN TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION process_purchase_transaction(UUID, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION rollback_purchase_transaction(UUID, INTEGER, INTEGER, VARCHAR) TO service_role; 