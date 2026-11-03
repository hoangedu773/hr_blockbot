import mongoose from "mongoose";
import { PosOrderModel } from "../models/PosOrder.js";
import { allowedStoreIds } from "./authorization-scope.service.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";

export interface RevenuePeriod {
  from: Date;
  to: Date;
}

export function currentMonthPeriod(now = new Date()): RevenuePeriod {
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export async function scopedRevenueMetric(user: AuthenticatedUser, period = currentMonthPeriod()) {
  const storeIds = allowedStoreIds(user, "dashboard.read");
  if (!storeIds.length) {
    return {
      value: null,
      reason: "Chưa có cửa hàng canonical trong phạm vi được cấp.",
      source: "none",
      asOf: null,
    };
  }

  const stores = storeIds.map((id) => new mongoose.Types.ObjectId(id));
  const [summary] = await PosOrderModel.aggregate<{ total: number }>([
    {
      $match: {
        storeId: { $in: stores },
        orderedAt: { $gte: period.from, $lt: period.to },
        status: "COMPLETED",
      },
    },
    { $group: { _id: null, total: { $sum: "$netRevenueVnd" } } },
  ]);

  return {
    value: Math.round(summary?.total ?? 0),
    reason: null,
    source: "pos_orders",
    asOf: period.to.toISOString(),
  };
}
