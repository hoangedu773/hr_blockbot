import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { ScheduleEntryModel } from "./models/ScheduleEntry.js";
import { AttendanceCorrectionModel } from "./models/AttendanceCorrection.js";
import { EmployeeModel } from "./models/Employee.js";

let io: SocketIOServer | null = null;

export function initSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH"],
    },
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Join store room if requested
    socket.on("room:join", (room: string) => {
      socket.join(room);
      console.log(`[Socket.IO] ${socket.id} joined room ${room}`);
    });

    // Handle chat:send
    socket.on("chat:send", async (data: {
      content: string;
      employee_code?: string;
      store_name?: string;
    }) => {
      const { content, employee_code, store_name } = data || {};
      console.log(`[Socket.IO] Message from ${employee_code || "guest"}: "${content}"`);

      const text = (content || "").toLowerCase().trim();

      let reply = "Xin chào! Tôi là Trợ lý HR BlockBot. Bạn có thể hỏi tôi về lịch ca, phiếu chấm công hoặc quy chế làm việc.";
      let intent = "general";
      let citations: string[] = [];

      try {
        // Rule-based intent detection with direct database answers
        if (text.includes("hôm nay") || text.includes("ca làm") || text.includes("lịch ca") || text.includes("lịch trực")) {
          intent = "query_schedule";
          const query: Record<string, unknown> = {};
          if (employee_code) {
            query.employee_code = employee_code.toUpperCase();
          } else {
            query.work_date = "2026-10-05";
          }

          const schedules = await ScheduleEntryModel.find(query).limit(5).lean();
          if (schedules.length > 0) {
            const list = schedules
              .map((s) => `• ${s.employee_name} (${s.employee_code}) - ${s.shift_code} ngày ${s.work_date}`)
              .join("\n");
            reply = `Tìm thấy ${schedules.length} ca làm việc:\n${list}`;
          } else {
            reply = "Không tìm thấy ca làm việc phù hợp trong hệ thống.";
          }
        } else if (text.includes("quên vân tay") || text.includes("quên bấm") || text.includes("giải trình") || text.includes("hạn nộp")) {
          intent = "rag_policy";
          reply =
            "Theo Quy chế Chấm công GUTA (Phiên bản 2026 - Điều 12, Khoản 3), nhân viên quên bấm vân tay phải nộp phiếu giải trình trước ngày 05 hàng tháng để kịp chốt kỳ lương ngày 6/X - 5/Y. Quá hạn hệ thống sẽ khóa bảng công kỳ đó.";
          citations = [
            "Quy chế Chấm công & Khen thưởng GUTA v2.1 - Điều 12, Khoản 3",
          ];
        } else if (text.includes("ai làm") && text.includes("ca a")) {
          intent = "query_coworkers";
          const coworkers = await ScheduleEntryModel.find({
            shift_code: { $regex: "^a", $options: "i" },
            work_date: "2026-10-05",
          })
            .limit(4)
            .lean();

          if (coworkers.length > 0) {
            const list = coworkers
              .map((c) => `• ${c.employee_name} (${c.employee_code}) - ${c.shift_code}`)
              .join("\n");
            reply = `Các nhân sự trực ca A hôm nay gồm:\n${list}`;
          } else {
            reply = "Không có nhân sự nào trực ca A trong ngày này.";
          }
        } else if (text.includes("nhân viên") || text.includes("hồ sơ")) {
          intent = "query_employee";
          if (employee_code) {
            const emp: any = await EmployeeModel.findOne({
              employee_code: employee_code.toUpperCase(),
            }).lean();
            if (emp) {
              reply = `Nhân viên: ${emp.full_name} (${emp.employee_code})\nChức danh: ${emp.job_title}\nCửa hàng: ${emp.store_raw}\nTrạng thái: ${emp.profile_status}`;
            } else {
              reply = `Không tìm thấy nhân viên với mã ${employee_code}.`;
            }
          } else {
            reply = "Vui lòng cung cấp mã nhân viên (ví dụ GT-CH18030009) để tra cứu hồ sơ.";
          }
        }
      } catch (err) {
        console.error("Error generating chat reply:", err);
        reply = "Đã xảy ra lỗi khi tra cứu dữ liệu. Vui lòng thử lại sau.";
      }

      socket.emit("chat:message", {
        id: `msg-${Date.now()}`,
        sender: "bot",
        content: reply,
        timestamp: new Date().toISOString(),
        intent,
        citations,
        status: "received",
      });
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}
