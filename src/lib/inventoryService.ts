import { supabase } from './supabase';
import { InventoryBalance, InventoryMovement } from '../types';

export const inventoryService = {
  /**
   * Retrieves all actual stock inventory balances for a given organization
   */
  async getBalances(orgId: string): Promise<InventoryBalance[]> {
    const { data, error } = await supabase
      .from('inventory_balances')
      .select('*, item:items(*)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as InventoryBalance[];
  },

  /**
   * Retrieves all actual inventory historical ledger logs for a given organization
   */
  async getMovements(orgId: string): Promise<InventoryMovement[]> {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*, item:items(*)')
      .eq('organization_id', orgId)
      .order('movement_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as InventoryMovement[];
  }
};
