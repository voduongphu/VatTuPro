import { InventoryItem, ConditionRule, MatchLogic } from '../types/inventory';
import { removeVietnameseTones } from './formatters';

/**
 * Multi-condition filter engine for evaluating inventory items
 */

export function getItemStockStatus(item: InventoryItem): 'HET_HANG' | 'THIEU_HUT' | 'VUOT_DINH_MUC' | 'HOP_LE' {
  if (item.currentStock <= 0) return 'HET_HANG';
  if (item.currentStock < item.minStock) return 'THIEU_HUT';
  if (item.maxStock > 0 && item.currentStock > item.maxStock) return 'VUOT_DINH_MUC';
  return 'HOP_LE';
}

export function getItemMaintenanceStatus(item: InventoryItem): 'OVERDUE' | 'DUE_SOON' | 'OK' | 'NONE' {
  if (!item.nextMaintenanceDate) return 'NONE';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(item.nextMaintenanceDate);
  targetDate.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'OVERDUE';
  if (diffDays <= 30) return 'DUE_SOON';
  return 'OK';
}

export function getItemExpiryStatus(item: InventoryItem): 'EXPIRED' | 'EXPIRING_SOON' | 'SAFE' | 'NONE' {
  if (!item.expiryDate) return 'NONE';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(item.expiryDate);
  targetDate.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'EXPIRED';
  if (diffDays <= 60) return 'EXPIRING_SOON';
  return 'SAFE';
}

/**
 * Evaluates whether a single item matches a specific condition rule
 */
export function evaluateConditionRule(item: InventoryItem, rule: ConditionRule): boolean {
  const { field, operator, value, secondaryValue } = rule;

  // 1. General search across multiple textual columns
  if (field === 'searchQuery') {
    if (!value || typeof value !== 'string' || value.trim() === '') return true;
    const query = removeVietnameseTones(value);
    const haystack = removeVietnameseTones(
      [
        item.code,
        item.name,
        item.modelSpecs,
        item.serialNumber || '',
        item.lotNumber || '',
        item.packingListNo || '',
        item.shipment || '',
        item.manufacturer || '',
        item.packageNo || '',
        item.packageName || '',
        item.projectItem || '',
        item.locationBin,
        item.warehouse,
        item.supplier,
        item.allocatedProject || '',
        item.notes || '',
      ].join(' ')
    );
    return haystack.includes(query);
  }

  // 2. Computed property checks
  if (field === 'stockStatus') {
    const status = getItemStockStatus(item);
    if (operator === 'EQUALS') return status === value;
    if (operator === 'NOT_EQUALS') return status !== value;
    return true;
  }

  if (field === 'maintenanceDue') {
    const status = getItemMaintenanceStatus(item);
    if (operator === 'EQUALS') return status === value;
    if (operator === 'NOT_EQUALS') return status !== value;
    return true;
  }

  if (field === 'expiryStatus') {
    const status = getItemExpiryStatus(item);
    if (operator === 'EQUALS') return status === value;
    if (operator === 'NOT_EQUALS') return status !== value;
    return true;
  }

  if (field === 'totalValue') {
    const totalVal = item.currentStock * item.unitPrice;
    const numVal = Number(value);
    if (isNaN(numVal)) return true;
    if (operator === 'GREATER_THAN') return totalVal >= numVal;
    if (operator === 'LESS_THAN') return totalVal <= numVal;
    if (operator === 'BETWEEN') {
      const min = Number(value) || 0;
      const max = Number(secondaryValue) || Infinity;
      return totalVal >= min && totalVal <= max;
    }
    return true;
  }

  // 3. Numeric comparisons
  if (field === 'currentStock' || field === 'unitPrice') {
    const itemVal = item[field];
    const numVal = Number(value);
    if (operator === 'GREATER_THAN') return itemVal >= numVal;
    if (operator === 'LESS_THAN') return itemVal <= numVal;
    if (operator === 'EQUALS') return itemVal === numVal;
    if (operator === 'NOT_EQUALS') return itemVal !== numVal;
    if (operator === 'BETWEEN') {
      const min = Number(value) || 0;
      const max = Number(secondaryValue) || Infinity;
      return itemVal >= min && itemVal <= max;
    }
    return true;
  }

  // 4. String / Enumerated field checks
  const rawItemVal = item[field as keyof InventoryItem];
  const itemStr = rawItemVal !== undefined && rawItemVal !== null ? String(rawItemVal) : '';

  if (operator === 'IS_EMPTY') {
    return itemStr.trim() === '';
  }

  if (operator === 'IS_NOT_EMPTY') {
    return itemStr.trim() !== '';
  }

  if (operator === 'EQUALS') {
    return itemStr.toLowerCase() === String(value || '').toLowerCase();
  }

  if (operator === 'NOT_EQUALS') {
    return itemStr.toLowerCase() !== String(value || '').toLowerCase();
  }

  if (operator === 'CONTAINS') {
    const searchVal = removeVietnameseTones(String(value || ''));
    return removeVietnameseTones(itemStr).includes(searchVal);
  }

  if (operator === 'IN_LIST') {
    if (Array.isArray(value)) {
      return value.includes(itemStr);
    }
    return true;
  }

  return true;
}

/**
 * Evaluates an item against a set of rules with AND / OR logic
 */
export function matchItemWithRules(
  item: InventoryItem,
  rules: ConditionRule[],
  logic: MatchLogic = 'AND'
): boolean {
  if (!rules || rules.length === 0) return true;

  if (logic === 'AND') {
    return rules.every(rule => evaluateConditionRule(item, rule));
  } else {
    return rules.some(rule => evaluateConditionRule(item, rule));
  }
}
