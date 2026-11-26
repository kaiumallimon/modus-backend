import { BadRequestException } from '@nestjs/common';

export enum PricingAdjustmentType {
  FIXED = 'FIXED',
  PERCENTAGE = 'PERCENTAGE',
}

export interface ComputedLinePricing {
  unitPrice: number;
  lineSubtotal: number;
  discountType: PricingAdjustmentType;
  discountValue: number;
  discountAmount: number;
  taxType: PricingAdjustmentType;
  taxValue: number;
  taxAmount: number;
  lineTotal: number;
}

export function roundQty(val: number): number {
  return Math.round(val * 10000) / 10000;
}

/**
 * Converts major currency amount to integer minor units (cents) to avoid IEEE-754 drift.
 */
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
 * Computes line pricing deterministically using integer minor units (cents):
 *   Line Subtotal = round(Quantity * Unit Price)
 *   Discount = Fixed cents OR round(Line Subtotal * pct / 100)
 *   Tax = Fixed cents OR round((Line Subtotal - Discount) * pct / 100)
 *   Line Total = Line Subtotal - Discount + Tax
 */
export function computeLinePricing(params: {
  orderedQuantity: number;
  unitPrice: number;
  discountType?: PricingAdjustmentType;
  discountValue?: number;
  taxType?: PricingAdjustmentType;
  taxValue?: number;
}): ComputedLinePricing {
  const {
    orderedQuantity,
    unitPrice,
    discountType = PricingAdjustmentType.FIXED,
    discountValue = 0,
    taxType = PricingAdjustmentType.FIXED,
    taxValue = 0,
  } = params;

  if (!Number.isFinite(orderedQuantity) || orderedQuantity <= 0) {
    throw new BadRequestException('Ordered quantity must be greater than 0');
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new BadRequestException('Unit purchase price cannot be negative');
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
  if (discountType === PricingAdjustmentType.PERCENTAGE) {
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
  if (taxType === PricingAdjustmentType.PERCENTAGE) {
    if (taxValue > 100) {
      throw new BadRequestException('Percentage tax cannot exceed 100%');
    }
    taxCents = Math.round((taxableCents * taxValue) / 100);
  } else {
    taxCents = toCents(taxValue);
  }

  const lineTotalCents = taxableCents + taxCents;
  if (lineTotalCents < 0) {
    throw new BadRequestException('Computed line total cannot be negative');
  }

  return {
    unitPrice: fromCents(unitCents),
    lineSubtotal: fromCents(subtotalCents),
    discountType,
    discountValue:
      discountType === PricingAdjustmentType.PERCENTAGE
        ? Math.round(discountValue * 100) / 100
        : fromCents(discountCents),
    discountAmount: fromCents(discountCents),
    taxType,
    taxValue:
      taxType === PricingAdjustmentType.PERCENTAGE
        ? Math.round(taxValue * 100) / 100
        : fromCents(taxCents),
    taxAmount: fromCents(taxCents),
    lineTotal: fromCents(lineTotalCents),
  };
}
