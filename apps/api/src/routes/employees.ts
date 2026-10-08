import { Router } from "express";
import { EmployeeModel } from "../models/Employee.js";

const router = Router();

// GET /api/employees - Search, filter, pagination
router.get("/employees", async (req, res) => {
  try {
    const { store, q, page = "1", limit = "50" } = req.query;

    const query: Record<string, unknown> = {};

    if (store && typeof store === "string") {
      query.store_raw = { $regex: store, $options: "i" };
    }

    if (q && typeof q === "string") {
      query.$or = [
        { employee_code: { $regex: q, $options: "i" } },
        { full_name: { $regex: q, $options: "i" } },
        { job_title: { $regex: q, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      EmployeeModel.find(query).skip(skip).limit(limitNum).lean(),
      EmployeeModel.countDocuments(query),
    ]);

    res.json({
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("Error fetching employees:", err);
    res.status(500).json({ error: "Failed to fetch employees" });
  }
});

// GET /api/employees/:code - Get single employee by code
router.get("/employees/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const employee = await EmployeeModel.findOne({
      employee_code: code.trim().toUpperCase(),
    }).lean();

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.json({ data: employee });
  } catch (err) {
    console.error("Error fetching employee:", err);
    res.status(500).json({ error: "Failed to fetch employee" });
  }
});

export default router;
