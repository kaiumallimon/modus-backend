import type { PermissionDefinition } from '../../../access-control/constants/permissions.constant';

export const PROCUREMENT_MODULE_ID = 'procurement';
export const PROCUREMENT_APP_CURRENCY = process.env.APP_CURRENCY || 'USD';

export const PROCUREMENT_PERMISSION_GROUPS: Record<
  string,
  { name: string; description: string }
> = {
  'procurement-dashboard': {
    name: 'Procurement — Dashboard',
    description: 'View procurement overview metrics and recent purchasing activity',
  },
  'procurement-suppliers': {
    name: 'Procurement — Suppliers',
    description: 'Manage supplier directory, contacts, and activation status',
  },
  'procurement-purchase-orders': {
    name: 'Procurement — Purchase Orders',
    description: 'Create, edit, submit, cancel, and inspect purchase orders',
  },
  'procurement-goods-receipts': {
    name: 'Procurement — Goods Receipts',
    description: 'Create and confirm goods receipts into inventory warehouses',
  },
  'procurement-supplier-transactions': {
    name: 'Procurement — Supplier Transactions',
    description: 'Inspect supplier transaction summaries and statements',
  },
};

export const PROCUREMENT_PERMISSIONS: PermissionDefinition[] = [
  // Dashboard
  {
    id: 'procurement.dashboard.read',
    name: 'View Procurement Dashboard',
    description: 'Inspect procurement summary metrics, recent orders, and receipts',
    module: 'procurement-dashboard',
  },

  // Suppliers
  {
    id: 'procurement.suppliers.read',
    name: 'View Suppliers',
    description: 'Browse supplier directory, contacts, and supplier details',
    module: 'procurement-suppliers',
  },
  {
    id: 'procurement.suppliers.create',
    name: 'Create Suppliers',
    description: 'Register new suppliers and contact details',
    module: 'procurement-suppliers',
  },
  {
    id: 'procurement.suppliers.update',
    name: 'Update Suppliers',
    description: 'Edit supplier profile, contacts, and details',
    module: 'procurement-suppliers',
  },
  {
    id: 'procurement.suppliers.delete',
    name: 'Deactivate / Delete Suppliers',
    description: 'Deactivate suppliers or remove unused supplier records',
    module: 'procurement-suppliers',
  },

  // Purchase Orders
  {
    id: 'procurement.purchase-orders.read',
    name: 'View Purchase Orders',
    description: 'Browse purchase orders, line pricing, and printable details',
    module: 'procurement-purchase-orders',
  },
  {
    id: 'procurement.purchase-orders.create',
    name: 'Create Purchase Orders',
    description: 'Create draft purchase orders with product line items',
    module: 'procurement-purchase-orders',
  },
  {
    id: 'procurement.purchase-orders.update',
    name: 'Update Purchase Orders',
    description: 'Modify draft purchase orders before submission',
    module: 'procurement-purchase-orders',
  },
  {
    id: 'procurement.purchase-orders.submit',
    name: 'Submit Purchase Orders',
    description: 'Submit draft purchase orders to ordered status',
    module: 'procurement-purchase-orders',
  },
  {
    id: 'procurement.purchase-orders.cancel',
    name: 'Cancel Purchase Orders',
    description: 'Cancel draft or unreceived purchase orders',
    module: 'procurement-purchase-orders',
  },

  // Goods Receipts
  {
    id: 'procurement.goods-receipts.read',
    name: 'View Goods Receipts',
    description: 'Inspect goods receipt history and received quantities',
    module: 'procurement-goods-receipts',
  },
  {
    id: 'procurement.goods-receipts.create',
    name: 'Create Goods Receipts',
    description: 'Record draft goods receipts against ordered purchase orders',
    module: 'procurement-goods-receipts',
  },
  {
    id: 'procurement.goods-receipts.confirm',
    name: 'Confirm Goods Receipts',
    description: 'Confirm goods receipts to update warehouse stock in Inventory',
    module: 'procurement-goods-receipts',
  },

  // Supplier Transactions
  {
    id: 'procurement.supplier-transactions.read',
    name: 'View Supplier Transactions',
    description: 'Inspect supplier purchasing commitments and receiving statements',
    module: 'procurement-supplier-transactions',
  },
];

export const PROCUREMENT_ANY_READ_PERMISSIONS = [
  'procurement.dashboard.read',
  'procurement.suppliers.read',
  'procurement.purchase-orders.read',
  'procurement.goods-receipts.read',
  'procurement.supplier-transactions.read',
] as const;
