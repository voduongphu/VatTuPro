import { InventoryItem, Transaction, User, Warehouse } from '../types/inventory';

export const INITIAL_WAREHOUSES: Warehouse[] = [
  {
    id: 'WH-01',
    code: 'KHO-01',
    name: 'Kho Tổng Trung Tâm',
    address: 'Trụ sở chính PTSC',
    manager: 'Quản trị viên',
    status: 'ACTIVE',
  },
];

export const INITIAL_ITEMS: InventoryItem[] = [];

export const INITIAL_TRANSACTIONS: Transaction[] = [];

export const INITIAL_USERS: User[] = [
  {
    id: 'USR-ADMIN',
    username: 'admin',
    password: 'admin123',
    fullName: 'Quản Trị Viên',
    role: 'ADMIN',
    email: 'admin@khovattu.pro',
    phone: '0901.156.220',
    assignedWarehouseId: 'ALL',
    status: 'ACTIVE',
    createdAt: '2026-01-01 08:00',
  },
];
