import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../src/db.js";

const PRODUCTS = [
  ["CAFE-SUA-DA", "Cafe Sữa Đá", 28000],
  ["CAFE-DEN-DA", "Cafe Đen Đá", 26000],
  ["TRA-DAO", "Trà Đào", 32000],
  ["BAXIU-DA", "Bạc Xỉu Đá", 35000],
  ["BANHMI-OPLA", "Bánh Mì Ốp La", 42000],
] as const;
const CHANNELS = ["IN_STORE", "APP", "SHOPEEFOOD", "PARTNER"] as const;
const PAYMENTS = ["CASH", "MOMO", "ZALOPAY", "VNPAY"] as const;

function utcDay(date: Date, day: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day, 7 + (day % 12), (day * 7) % 60));
}

async function main() {
  await connectDB();
  try {
    const stores = await mongoose.connection.collection("stores").find({ kind: "outlet", status: "ACTIVE", deleted_at: null }).project({ _id: 1 }).toArray();
    if (!stores.length) throw new Error("No active outlet stores available for POS seed");

    await mongoose.connection.collection("pos_orders").deleteMany({ source: "demo" });
    const now = new Date();
    const orders = [];
    for (const store of stores) {
      for (let day = 1; day <= now.getUTCDate(); day += 1) {
        for (let sequence = 0; sequence < 6; sequence += 1) {
          const product = PRODUCTS[(day + sequence) % PRODUCTS.length];
          const quantity = 1 + ((day + sequence) % 2);
          const subtotalVnd = product[2] * quantity;
          const discountVnd = sequence === 5 ? 5000 : 0;
          const isCancelled = day % 11 === 0 && sequence === 5;
          const orderedAt = utcDay(now, day);
          orderedAt.setUTCMinutes(orderedAt.getUTCMinutes() + sequence * 8);
          orders.push({
            orderId: `DEMO-${String(store._id)}-${now.getUTCFullYear()}${now.getUTCMonth() + 1}-${day}-${sequence}`,
            storeId: store._id,
            orderedAt,
            channel: CHANNELS[(day + sequence) % CHANNELS.length],
            paymentMethod: PAYMENTS[(day + sequence) % PAYMENTS.length],
            status: isCancelled ? "CANCELLED" : "COMPLETED",
            subtotalVnd,
            discountVnd,
            refundVnd: 0,
            netRevenueVnd: isCancelled ? 0 : subtotalVnd - discountVnd,
            items: [{
              productId: product[0],
              productName: product[1],
              quantity,
              unitPriceVnd: product[2],
              lineTotalVnd: subtotalVnd,
            }],
            source: "demo",
          });
        }
      }
    }
    await mongoose.connection.collection("pos_orders").insertMany(orders);
    console.log(`[POS demo] Seeded ${orders.length} orders across ${stores.length} active outlets`);
  } finally {
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error("[POS demo] Seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
