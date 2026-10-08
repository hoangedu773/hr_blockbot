import { Router } from "express";
import { AttendanceCorrectionModel } from "../models/AttendanceCorrection.js";
import { getIO } from "../socket.js";

const router = Router();

// GET /api/corrections - List corrections (filter by status, store_name, employee_code)
router.get("/corrections", async (req, res) => {
  try {
    const { status, store_name, employee_code, limit = "100" } = req.query;

    const query: Record<string, unknown> = {};

    if (status && typeof status === "string") {
      query.status = status.toUpperCase();
    }
    if (store_name && typeof store_name === "string") {
      query.store_name = { $regex: store_name, $options: "i" };
    }
    if (employee_code && typeof employee_code === "string") {
      query.employee_code = employee_code.trim().toUpperCase();
    }

    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 100));

    const corrections = await AttendanceCorrectionModel.find(query)
      .sort({ work_date: -1, _id: -1 })
      .limit(limitNum)
      .lean();

    res.json({
      data: corrections,
      total: corrections.length,
    });
  } catch (err) {
    console.error("Error fetching corrections:", err);
    res.status(500).json({ error: "Failed to fetch corrections" });
  }
});

// POST /api/corrections - Submit new correction
router.post("/corrections", async (req, res) => {
  try {
    const {
      employee_code,
      employee_name,
      store_name,
      work_date,
      shift_code,
      period_banner = "CHẤM THEO KỲ LƯƠNG 6/5-5/6/2026",
      note,
    } = req.body;

    if (!employee_code || !store_name || !work_date || !shift_code || !note) {
      return res.status(400).json({
        error: "Missing required fields: employee_code, store_name, work_date, shift_code, note",
      });
    }

    const newCorrection = await AttendanceCorrectionModel.create({
      employee_code: employee_code.trim().toUpperCase(),
      employee_name: employee_name?.trim() || null,
      store_name: store_name.trim(),
      work_date,
      shift_code,
      period_banner,
      note,
      status: "PENDING",
    });

    // Notify via Socket.IO
    try {
      const io = getIO();
      if (io) {
        io.emit("correction:new", newCorrection);
      }
    } catch {
      // socket might not be initialized in test
    }

    res.status(201).json({ data: newCorrection });
  } catch (err) {
    console.error("Error creating correction:", err);
    res.status(500).json({ error: "Failed to submit correction" });
  }
});

// PATCH /api/corrections/:id/status - Approve or reject correction
router.patch("/corrections/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewed_by = "Store Manager" } = req.body;

    if (!["APPROVED", "REJECTED", "PENDING"].includes(status)) {
      return res.status(400).json({
        error: "Invalid status. Allowed values: PENDING, APPROVED, REJECTED",
      });
    }

    const updated = await AttendanceCorrectionModel.findByIdAndUpdate(
      id,
      {
        status,
        reviewed_by,
        reviewed_at: new Date(),
      },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: "Correction record not found" });
    }

    // Broadcast update
    try {
      const io = getIO();
      if (io) {
        io.emit("correction:updated", updated);
      }
    } catch {
      // ignore
    }

    res.json({ data: updated });
  } catch (err) {
    console.error("Error updating correction status:", err);
    res.status(500).json({ error: "Failed to update correction status" });
  }
});

export default router;
