import { Router } from "express";
import { ScheduleEntryModel } from "../models/ScheduleEntry.js";

const router = Router();

// GET /api/schedules - Query schedules by date, employee_code, block_code, or sheet_name
router.get("/schedules", async (req, res) => {
  try {
    const { date, employee_code, block_code, sheet_name, limit = "100" } = req.query;

    const query: Record<string, unknown> = {};

    if (date && typeof date === "string") {
      query.work_date = date;
    }
    if (employee_code && typeof employee_code === "string") {
      query.employee_code = employee_code.trim().toUpperCase();
    }
    if (block_code && typeof block_code === "string") {
      query.block_code = block_code;
    }
    if (sheet_name && typeof sheet_name === "string") {
      query.sheet_name = sheet_name;
    }

    const limitNum = Math.min(500, Math.max(1, parseInt(limit as string, 10) || 100));

    const schedules = await ScheduleEntryModel.find(query)
      .sort({ work_date: 1, shift_code: 1 })
      .limit(limitNum)
      .lean();

    res.json({
      data: schedules,
      total: schedules.length,
    });
  } catch (err) {
    console.error("Error fetching schedules:", err);
    res.status(500).json({ error: "Failed to fetch schedules" });
  }
});

// POST /api/schedules - Create a new schedule entry
router.post("/schedules", async (req, res) => {
  try {
    const {
      employee_code,
      employee_name,
      block_code,
      work_date,
      shift_code,
      schedule_type = "actual",
    } = req.body;

    if (!employee_code || !employee_name || !work_date || !shift_code) {
      return res.status(400).json({
        error: "Missing required fields: employee_code, employee_name, work_date, shift_code",
      });
    }

    const newEntry = await ScheduleEntryModel.create({
      employee_code: employee_code.trim().toUpperCase(),
      employee_name: employee_name.trim(),
      block_code: block_code || "1BNK",
      work_date,
      shift_code,
      schedule_type,
      row_kind: "employee",
    });

    res.status(201).json({ data: newEntry });
  } catch (err) {
    console.error("Error creating schedule:", err);
    res.status(500).json({ error: "Failed to create schedule" });
  }
});

export default router;
