import { Router } from "express";
import { StoreModel } from "../models/Store.js";

const router = Router();

// GET /api/stores - List all stores
router.get("/stores", async (_req, res) => {
  try {
    const stores = await StoreModel.find()
      .sort({ store_name: 1 })
      .lean();

    res.json({
      data: stores,
      total: stores.length,
    });
  } catch (err) {
    console.error("Error fetching stores:", err);
    res.status(500).json({ error: "Failed to fetch stores" });
  }
});

export default router;
