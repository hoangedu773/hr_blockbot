import { Router } from "express";
import {
  CashCountModel,
  CashDenominationModel,
  CashSummaryModel,
} from "../models/Cash.js";

const router = Router();

// GET /api/cash - Combined overview for dashboard
router.get("/cash", async (_req, res) => {
  try {
    const [counts, denominations, summary] = await Promise.all([
      CashCountModel.find().lean(),
      CashDenominationModel.find().lean(),
      CashSummaryModel.find().lean(),
    ]);
    res.json({ counts, denominations, summary });
  } catch (err) {
    console.error("Error fetching combined cash data:", err);
    res.status(500).json({ error: "Failed to fetch cash data" });
  }
});

// GET /api/cash/counts - List cash counts
router.get("/cash/counts", async (req, res) => {
  try {
    const { store_name } = req.query;
    const query: Record<string, unknown> = {};

    if (store_name && typeof store_name === "string") {
      query.store_name = { $regex: store_name, $options: "i" };
    }

    const counts = await CashCountModel.find(query).lean();
    res.json({ data: counts, total: counts.length });
  } catch (err) {
    console.error("Error fetching cash counts:", err);
    res.status(500).json({ error: "Failed to fetch cash counts" });
  }
});

// GET /api/cash/denominations - List cash denominations
router.get("/cash/denominations", async (_req, res) => {
  try {
    const denoms = await CashDenominationModel.find()
      .sort({ denomination_vnd: -1 })
      .lean();
    res.json({ data: denoms, total: denoms.length });
  } catch (err) {
    console.error("Error fetching denominations:", err);
    res.status(500).json({ error: "Failed to fetch denominations" });
  }
});

// GET /api/cash/summary - Get latest cash summary
router.get("/cash/summary", async (_req, res) => {
  try {
    const summary = await CashSummaryModel.findOne().lean();
    res.json({ data: summary });
  } catch (err) {
    console.error("Error fetching cash summary:", err);
    res.status(500).json({ error: "Failed to fetch cash summary" });
  }
});

export default router;
