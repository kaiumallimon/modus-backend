import { BadRequestException } from '@nestjs/common';

export enum SalesPricingAdjustmentType {
  FIXED = 'FIXED',
  PERCENTAGE = 'PERCENTAGE',
}

export interface ComputedSalesLinePricing {
  unitPrice: number;
  lineSubtotal: number;
  discountType: SalesPricingAdjustmentType;
  discountValue: number;
  discountAmount: number;
  taxType: SalesPricingAdjustmentType;
  taxValue: number;
  taxAmount: number;
  lineTotal: number;
}

export function roundQty(val: number): number {
  return Math.round(val * 10000) / 10000;
}

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new BadRequestException('Invalid monetary amount');
  }
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Computes line pricing deterministically using integer minor units (cents).
 */
export function computeSalesLinePricing(params: {
  orderedQuantity: number;
  unitPrice: number;
  discountType?: SalesPricingAdjustmentType;
  discountValue?: number;
  taxType?: SalesPricingAdjustmentType;
  taxValue?: number;
}): ComputedSalesLinePricing {
  const {
    orderedQuantity,
    unitPrice,
    discountType = SalesPricingAdjustmentType.FIXED,
    discountValue = 0,
    taxType = SalesPricingAdjustmentType.FIXED,
    taxValue = 0,
  } = params;

  if (!Number.isFinite(orderedQuantity) || orderedQuantity <= 0) {
    throw new BadRequestException('Ordered quantity must be greater than 0');
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new BadRequestException('Unit selling price cannot be negative');
  }
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    throw new BadRequestException('Discount value cannot be negative');
  }
  if (!Number.isFinite(taxValue) || taxValue < 0) {
    throw new BadRequestException('Tax value cannot be negative');
  }

  const unitCents = toCents(unitPrice);
  const subtotalCents = Math.round(orderedQuantity * unitCents);

  let discountCents = 0;
  if (discountType === SalesPricingAdjustmentType.PERCENTAGE) {
    if (discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }
    discountCents = Math.round((subtotalCents * discountValue) / 100);
  } else {
    discountCents = toCents(discountValue);
  }

  if (discountCents > subtotalCents) {
    throw new BadRequestException(
      'Line discount amount cannot exceed line subtotal',
    );
  }

  const taxableCents = subtotalCents - discountCents;
  let taxCents = 0;
  if (taxType === SalesPricingAdjustmentType.PERCENTAGE) {
    if (taxValue > 100) {
      throw new BadRequestException('Percentage tax cannot exceed 100%');
    }
    taxCents = Math.round((taxableCents * taxValue) / 100);
  } else {
    taxCents = toCents(taxValue);
  }

  const lineTotalCents = taxableCents + taxCents;

  return {
    unitPrice: fromCents(unitCents),
    lineSubtotal: fromCents(subtotalCents),
    discountType,
    discountValue,
    discountAmount: fromCents(discountCents),
    taxType,
    taxValue,
    taxAmount: fromCents(taxCents),
    lineTotal: fromCents(lineTotalCents),
  };
}

export function computeSalesOrderTotals(lines: ComputedSalesLinePricing[]): {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
} {
  let subtotalCents = 0;
  let discountTotalCents = 0;
  let taxTotalCents = 0;
  let grandTotalCents = 0;

  for (const line of lines) {
    subtotalCents += toCents(line.lineSubtotal);
    discountTotalCents += toCents(line.discountAmount);
    taxTotalCents += toCents(line.taxAmount);
    grandTotalCents += toCents(line.lineTotal);
  }

  return {
    subtotal: fromCents(subtotalCents),
    discountTotal: fromCents(discountTotalCents),
    taxTotal: fromCents(taxTotalCents),
    grandTotal: fromCents(grandTotalCents),
  };
}

export function computeProportionalLineAmount(
  orderedQuantity: number,
  lineTotal: number,
  fulfilledQty: number,
): number {
  if (orderedQuantity <= 0 || fulfilledQty <= 0) return 0;
  const lineTotalCents = toCents(lineTotal);
  const proportionalCents = Math.round(
    (lineTotalCents * fulfilledQty) / orderedQuantity,
  );
  return fromCents(proportionalCents);
}
