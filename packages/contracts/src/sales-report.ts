import { z } from 'zod';

export const PosChannelSchema = z.enum(['IN_STORE', 'APP', 'SHOPEEFOOD', 'PARTNER']);
export const PosPaymentSchema = z.enum(['CASH', 'CARD', 'MOMO', 'ZALOPAY', 'VNPAY']);
export const PosStatusSchema = z.enum(['COMPLETED', 'CANCELLED', 'REFUNDED']);
const day = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/);
export const SalesReportQuerySchema = z.object({
  from: day, to: day,
  preset: z.enum(['today', 'yesterday', 'week', 'month', 'custom']).optional(),
  storeId: z.string().regex(/^[a-f0-9]{24}$/i).transform(s => s.toLowerCase()).optional(),
  channel: PosChannelSchema.optional(), paymentMethod: PosPaymentSchema.optional(), status: PosStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
}).strict();
export type SalesReportQuery = z.infer<typeof SalesReportQuerySchema>;
const count = z.number().int().nonnegative().safe();
const metrics = z.object({ totalOrders: count, cancelledOrders: count, externalOrders: count, salesOrders: count,
  revenueVnd: count, discountVnd: count, refundVnd: count, itemCount: count,
  averageOrderVnd: z.number().nonnegative().finite().nullable(), averageItems: z.number().nonnegative().finite().nullable() });
export const SalesReportSchema = z.object({
  period: z.object({ from: day, to: day, fromAt: z.string().datetime(), toAt: z.string().datetime(), timezone: z.literal('Asia/Ho_Chi_Minh') }),
  comparison: z.object({ fromAt: z.string().datetime(), toAt: z.string().datetime(), available: z.boolean(),
    changes: z.object({ totalOrders: z.number().finite().nullable(), cancelledOrders: z.number().finite().nullable(), externalOrders: z.number().finite().nullable(), revenueVnd: z.number().finite().nullable() }) }),
  stores: z.array(z.object({ id: z.string(), name: z.string() })),
  dataKind: z.enum(['demo', 'live', 'none']), reason: z.string().nullable(), asOf: z.string().datetime(),
  summary: metrics.nullable(),
  hourly: z.array(z.object({ hour: z.number().int().min(0).max(23), revenueVnd: count, orders: count,
    averageOrderVnd: z.number().nonnegative().finite().nullable(), averageItems: z.number().nonnegative().finite().nullable() })),
  channels: z.array(z.object({ key: PosChannelSchema, count })),
  payments: z.array(z.object({ key: PosPaymentSchema, count })),
  orders: z.array(z.object({ id: z.string(), orderId: z.string(), storeId: z.string(), storeName: z.string(), orderedAt: z.string().datetime(),
    channel: PosChannelSchema, paymentMethod: PosPaymentSchema, status: PosStatusSchema,
    subtotalVnd: count, discountVnd: count, refundVnd: count, netRevenueVnd: count,
    items: z.array(z.object({ productName: z.string(), quantity: count, unitPriceVnd: count, lineTotalVnd: count })) })),
  paging: z.object({ page: count, limit: count, totalItems: count, totalPages: count }),
});
export type SalesReport = z.infer<typeof SalesReportSchema>;
