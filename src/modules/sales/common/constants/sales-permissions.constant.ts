import type { PermissionDefinition } from '../../../access-control/constants/permissions.constant';

export const SALES_MODULE_ID = 'sales';
export const SALES_APP_CURRENCY = process.env.APP_CURRENCY || 'USD';

export const SALES_PERMISSION_GROUPS: Record<
  string,
  { name: string; description: string }
> = {
  'sales-dashboard': {
    name: 'Sales — Dashboard',
    description: 'View sales KPIs, revenue trends, and recent order activity',
  },
  'sales-customers': {
    name: 'Sales — Customers',
    description: 'Manage customers, contacts, and archive status',
  },
  'sales-orders': {
    name: 'Sales — Orders',
    description: 'Create, edit, confirm, cancel, and inspect sales orders',
  },
  'sales-fulfillments': {
    name: 'Sales — Fulfillments',
    description: 'Fulfill confirmed sales orders and deduct inventory stock',
  },
  'sales-reports': {
    name: 'Sales — Reports',
    description: 'View sales revenue summaries and top-selling products reports',
  },
};

export const SALES_PERMISSIONS: PermissionDefinition[] = [
  {
    id: 'sales.dashboard.read',
    name: 'View Sales Dashboard',
    description: 'Inspect sales KPIs, active orders, and top-selling items',
    module: 'sales-dashboard',
  },
  {
    id: 'sales.customers.read',
    name: 'View Customers',
    description: 'Browse customer directory, details, and sales history',
    module: 'sales-customers',
  },
  {
    id: 'sales.customers.create',
    name: 'Create Customers',
    description: 'Create new customer profiles',
    module: 'sales-customers',
  },
  {
    id: 'sales.customers.update',
    name: 'Update Customers',
    description: 'Edit customer details and contact information',
    module: 'sales-customers',
  },
  {
    id: 'sales.customers.archive',
    name: 'Archive / Restore Customers',
    description: 'Archive or reactivate customer accounts while preserving history',
    module: 'sales-customers',
  },
  {
    id: 'sales.orders.read',
    name: 'View Sales Orders',
    description: 'Browse sales orders, item snapshots, and fulfillment progress',
    module: 'sales-orders',
  },
  {
    id: 'sales.orders.create',
    name: 'Create Sales Orders',
    description: 'Create draft sales orders with customer and product snapshots',
    module: 'sales-orders',
  },
  {
    id: 'sales.orders.update',
    name: 'Update Sales Orders',
    description: 'Modify draft sales orders prior to confirmation',
    module: 'sales-orders',
  },
  {
    id: 'sales.orders.confirm',
    name: 'Confirm Sales Orders',
    description: 'Validate stock availability and confirm draft sales orders',
    module: 'sales-orders',
  },
  {
    id: 'sales.orders.cancel',
    name: 'Cancel Sales Orders',
    description: 'Cancel draft or unfulfilled confirmed sales orders',
    module: 'sales-orders',
  },
  {
    id: 'sales.fulfillments.read',
    name: 'View Order Fulfillments',
    description: 'Inspect sales fulfillment records and stock deduction history',
    module: 'sales-fulfillments',
  },
  {
    id: 'sales.fulfillments.create',
    name: 'Fulfill Sales Orders',
    description: 'Process partial or full order fulfillments and deduct stock',
    module: 'sales-fulfillments',
  },
  {
    id: 'sales.reports.read',
    name: 'View Sales Reports',
    description: 'Inspect fulfilled sales summaries and top-selling product analytics',
    module: 'sales-reports',
  },
];
