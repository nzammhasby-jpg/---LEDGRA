import { supabase } from './supabase';
import { InventoryBalance, InventoryMovement, InventoryAdjustment, InventoryAdjustmentLine } from '../types';

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
  },

  /**
   * Retrieves all inventory adjustments for a given organization
   */
  async getAdjustments(orgId: string): Promise<InventoryAdjustment[]> {
    const { data, error } = await supabase
      .from('inventory_adjustments')
      .select('*, creator:profiles!inventory_adjustments_created_by_fkey(full_name)')
      .eq('organization_id', orgId)
      .order('adjustment_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as any[];
  },

  /**
   * Retrieves a single inventory adjustment by ID, including its lines and items
   */
  async getAdjustmentById(id: string): Promise<InventoryAdjustment> {
    const { data: adj, error: adjError } = await supabase
      .from('inventory_adjustments')
      .select('*, creator:profiles!inventory_adjustments_created_by_fkey(full_name), approver:profiles!inventory_adjustments_approved_by_fkey(full_name), canceller:profiles!inventory_adjustments_cancelled_by_fkey(full_name)')
      .eq('id', id)
      .single();

    if (adjError) throw adjError;

    const { data: lines, error: linesError } = await supabase
      .from('inventory_adjustment_lines')
      .select('*, item:items(*)')
      .eq('adjustment_id', id)
      .order('created_at', { ascending: true });

    if (linesError) throw linesError;

    return {
      ...adj,
      lines: lines || []
    } as InventoryAdjustment;
  },

  /**
   * Creates a new inventory adjustment header (Draft)
   */
  async createAdjustment(
    orgId: string,
    date: string,
    type: string,
    reason: string,
    notes?: string | null
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_inventory_adjustment', {
      p_organization_id: orgId,
      p_adjustment_date: date,
      p_adjustment_type: type,
      p_reason: reason,
      p_notes: notes || null
    });

    if (error) throw error;
    return data as string;
  },

  /**
   * Adds or updates a line in a draft inventory adjustment
   */
  async addAdjustmentLine(
    adjId: string,
    itemId: string,
    actualQty?: number | null,
    adjQty?: number | null,
    unitCost?: number | null,
    notes?: string | null
  ): Promise<string> {
    const { data, error } = await supabase.rpc('add_inventory_adjustment_line', {
      p_adjustment_id: adjId,
      p_item_id: itemId,
      p_actual_quantity: actualQty !== undefined ? actualQty : null,
      p_adjustment_quantity: adjQty !== undefined ? adjQty : null,
      p_unit_cost: unitCost !== undefined ? unitCost : null,
      p_notes: notes || null
    });

    if (error) throw error;
    return data as string;
  },

  /**
   * Approves an inventory adjustment, logging stock movements and posting journal entries
   */
  async approveAdjustment(adjId: string): Promise<string> {
    const { data, error } = await supabase.rpc('approve_inventory_adjustment', {
      p_adjustment_id: adjId
    });

    if (error) throw error;
    return data as string;
  },

  /**
   * Cancels an inventory adjustment, doing a reverse journal entry and reverse inventory movements if approved
   */
  async cancelAdjustment(adjId: string, reason: string): Promise<string> {
    const { data, error } = await supabase.rpc('cancel_inventory_adjustment', {
      p_adjustment_id: adjId,
      p_reason: reason
    });

    if (error) throw error;
    return data as string;
  },

  /**
   * Deletes a draft inventory adjustment completely
   */
  async deleteAdjustment(id: string): Promise<void> {
    const { error } = await supabase
      .from('inventory_adjustments')
      .delete()
      .eq('id', id)
      .eq('status', 'draft');

    if (error) throw error;
  },

  /**
   * Deletes a line from a draft inventory adjustment and recalculates total_amount
   */
  async deleteAdjustmentLine(lineId: string, adjId: string): Promise<void> {
    // Delete line
    const { error: deleteError } = await supabase
      .from('inventory_adjustment_lines')
      .delete()
      .eq('id', lineId);

    if (deleteError) throw deleteError;

    // Fetch new sum
    const { data: sumData, error: sumError } = await supabase
      .from('inventory_adjustment_lines')
      .select('total_cost')
      .eq('adjustment_id', adjId);

    if (sumError) throw sumError;

    const newTotal = (sumData || []).reduce((sum, line) => sum + Number(line.total_cost || 0), 0);

    // Update adjustment total_amount
    const { error: updateError } = await supabase
      .from('inventory_adjustments')
      .update({
        total_amount: newTotal,
        updated_at: new Date().toISOString()
      })
      .eq('id', adjId);

    if (updateError) throw updateError;
  }
};

