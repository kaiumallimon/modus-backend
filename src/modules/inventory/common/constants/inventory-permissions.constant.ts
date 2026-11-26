import type { PermissionDefinition } from '../../../access-control/constants/permissions.constant';

export const INVENTORY_MODULE_ID = 'inventory';

export const INVENTORY_PERMISSION_GROUPS: Record<
  string,
  { name: string; description: string }
> = {
  'inventory-products': {
    name: 'Inventory — Products',
    description:
      'Manage product catalog, SKUs, barcodes, pricing, and product images',
  },
  'inventory-categories': {
    name: 'Inventory — Categories',
    description: 'Manage product categories and organizational hierarchy',
  },
  'inventory-units': {
    name: 'Inventory — Units of Measurement',
    description: 'Manage measurement units and unit symbols',
  },
  'inventory-warehouses': {
    name: 'Inventory — Warehouses',
    description: 'Manage storage locations and warehouse active state',
  },
  'inventory-stock': {
    name: 'Inventory — Stock & Operations',
    description:
      'Inspect warehouse stock levels and perform adjustments and transfers',
  },
  'inventory-movements': {
    name: 'Inventory — Movement Ledger',
    description: 'Inspect immutable append-only stock movement history',
  },
};

export const INVENTORY_PERMISSIONS: PermissionDefinition[] = [
  // Products
  {
    id: 'inventory.products.read',
    name: 'View Products',
    description: 'Read product catalog, pricing, thresholds, and details',
    module: 'inventory-products',
  },
  {
    id: 'inventory.products.create',
    name: 'Create Products',
    description: 'Add new products and upload product images',
    module: 'inventory-products',
  },
  {
    id: 'inventory.products.update',
    name: 'Update Products',
    description: 'Edit product details, pricing, thresholds, and images',
    module: 'inventory-products',
  },
  {
    id: 'inventory.products.delete',
    name: 'Archive / Delete Products',
    description: 'Archive or remove unused products from the catalog',
    module: 'inventory-products',
  },

  // Categories
  {
    id: 'inventory.categories.read',
    name: 'View Categories',
    description: 'Browse product categories and hierarchies',
    module: 'inventory-categories',
  },
  {
    id: 'inventory.categories.create',
    name: 'Create Categories',
    description: 'Create new product categories',
    module: 'inventory-categories',
  },
  {
    id: 'inventory.categories.update',
    name: 'Update Categories',
    description: 'Edit category details and parent associations',
    module: 'inventory-categories',
  },
  {
    id: 'inventory.categories.delete',
    name: 'Archive / Delete Categories',
    description: 'Archive or delete unreferenced product categories',
    module: 'inventory-categories',
  },

  // Units
  {
    id: 'inventory.units.read',
    name: 'View Units',
    description: 'Browse measurement units and symbols',
    module: 'inventory-units',
  },
  {
    id: 'inventory.units.create',
    name: 'Create Units',
    description: 'Add new units of measurement',
    module: 'inventory-units',
  },
  {
    id: 'inventory.units.update',
    name: 'Update Units',
    description: 'Edit measurement unit names and symbols',
    module: 'inventory-units',
  },
  {
    id: 'inventory.units.delete',
    name: 'Archive / Delete Units',
    description: 'Archive or delete unreferenced units of measurement',
    module: 'inventory-units',
  },

  // Warehouses
  {
    id: 'inventory.warehouses.read',
    name: 'View Warehouses',
    description: 'Browse warehouse locations and details',
    module: 'inventory-warehouses',
  },
  {
    id: 'inventory.warehouses.create',
    name: 'Create Warehouses',
    description: 'Register new storage warehouses',
    module: 'inventory-warehouses',
  },
  {
    id: 'inventory.warehouses.update',
    name: 'Update Warehouses',
    description: 'Modify warehouse details and addresses',
    module: 'inventory-warehouses',
  },
  {
    id: 'inventory.warehouses.delete',
    name: 'Deactivate / Delete Warehouses',
    description: 'Deactivate warehouses or delete unused warehouse records',
    module: 'inventory-warehouses',
  },

  // Stock
  {
    id: 'inventory.stock.read',
    name: 'View Stock & Operations',
    description:
      'Inspect per-warehouse stock balances, adjustments, and transfers',
    module: 'inventory-stock',
  },
  {
    id: 'inventory.stock.adjust',
    name: 'Adjust Stock',
    description:
      'Record opening stock, increases, and decreases per warehouse',
    module: 'inventory-stock',
  },
  {
    id: 'inventory.stock.transfer',
    name: 'Transfer Stock',
    description: 'Create and confirm inter-warehouse stock transfers',
    module: 'inventory-stock',
  },

  // Movements
  {
    id: 'inventory.movements.read',
    name: 'View Movement Ledger',
    description: 'Inspect immutable append-only stock movement history',
    module: 'inventory-movements',
  },
];

export const INVENTORY_ANY_READ_PERMISSIONS = [
  'inventory.products.read',
  'inventory.categories.read',
  'inventory.units.read',
  'inventory.warehouses.read',
  'inventory.stock.read',
  'inventory.movements.read',
] as const;
