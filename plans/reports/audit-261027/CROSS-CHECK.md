# Cross-check protocol — WorkBuddy ⇄ OMP

Mục tiêu: hai agent độc lập kiểm tra report của nhau, sao cho bất đồng **phát hiện được** thay vì tranh luận bằng văn xuôi.

Nguyên tắc gốc: **một report chỉ cross-check được nếu mỗi finding kiểm chứng được bằng máy.** Văn xuôi hay chữ "P0" không kiểm chứng được.

## Ba lớp, đừng trộn

| Lớp | Ai làm | Kiểm cái gì | Tất định? |
|---|---|---|---|
| 1. Cơ học | `scripts/verify-claims.mjs` (không cần LLM) | File có tồn tại? Anchor có đúng dòng? | Có — chạy lại luôn ra cùng kết quả |
| 2. Phán đoán độc lập | OMP (adversary) | Đoạn code đó **có thật là bug** không? Mức mấy? | Không — nhưng lệch là tín hiệu |
| 3. Trọng tài | Người | Bất đồng nào cần xử | — |

Lớp 1 bắt lỗi *dẫn chứng*. Lớp 2 bắt lỗi *suy luận*. Đừng dùng lớp 2 để thay lớp 1 — LLM phán "đúng" một claim có số dòng sai vẫn là report lỗi.

## Artifact

```
plans/reports/audit-261027/
  claims.json     # nguồn sự thật: id, severity, file, line, anchor, claim
  verdicts.json   # output lớp 1 (tự sinh, đừng sửa tay)
  omp-verdicts.json  # output lớp 2
  diff.md         # output so khớp
```

`claims.json` do bên viết report tạo. Bên review **được sửa** `claims.json` (thêm claim, sửa anchor) nhưng **không được sửa** `verdicts.json`.

## Lớp 1 — chạy cơ học

```bash
node scripts/verify-claims.mjs                 # in bảng + ghi verdicts.json
node scripts/verify-claims.mjs --json          # máy đọc
node scripts/verify-claims.mjs --only=P0       # chỉ P0
node scripts/verify-claims.mjs --fix           # ghi số dòng thật vào claims.json
```

Exit code: `0` mọi claim VERIFIED, `1` có FAIL, `2` spec lỗi. Cắm thẳng vào CI được.

Trạng thái: `VERIFIED` (anchor đúng dòng) · `DRIFT` (anchor có trong file nhưng khác dòng) · `FAIL` (không tìm thấy anchor / thiếu file).

> `DRIFT` không phải bug giả — bản chất finding thường vẫn đúng, chỉ số dòng sai. Nhưng report dẫn sai dòng là report lỗi, phải sửa.

## Lớp 2 — OMP phản biện

Quy tắc **blind**: OMP **không** được thấy `verdicts.json`, không được thấy severity tôi gán, không được thấy phần "đề xuất sửa". Nếu thấy, nó sẽ neo theo và cross-check thành vô nghĩa.

### Đường Orca (khuyến nghị cho setup hiện tại)

OMP được chạy qua **Orca** (`~/AppData/Local/Programs/orca`, v1.4.238) — Orca host agent qua hooks: `~/.orca/agent-hooks/` có `claude-hook`, `codex-hook`, `copilot-hook`, `orca-agent-hook`. Nghĩa là **không cần `omp -p`**: mở một session OMP thứ hai trong Orca, trỏ vào `plans/reports/audit-261027/omp-review-prompt.md`, để nó tự đọc `claims.json` + code và ghi `omp-verdicts.json`.

Đường này tránh được cả ba vấn đề của headless: `reg.exe` bị blacklist, treo `readPipedInput`, và 60s chờ MCP. OMP chạy trong Orca có tool đọc/ghi file nên không phải nhét excerpt vào prompt.

### Đường headless (dự phòng)

Vì `--no-tools` (OMP không đọc được file), phải nhét excerpt vào prompt. Đây là chủ ý: excerpt là **bằng chứng tối thiểu**, và việc OMP chỉ phán trên excerpt buộc nó không suy diễn ngoài dữ liệu.

```bash
# Sinh prompt từ claims.json (mỗi claim 1 block excerpt thủ công hoặc tự động)
omp -p "$(cat /tmp/xcheck-batch.txt)" \
    --no-tools --no-session --mode=text < /dev/null \
    > plans/reports/audit-261027/omp-verdicts.json 2>&1
```

> **Bắt buộc `< /dev/null`.** Thiếu nó, OMP treo vĩnh viễn ở `phase: readPipedInput` (đã đo: >4 phút, 0 token sinh ra) vì nó chờ EOF từ stdin của shell cha. Đây là lỗi im lặng — không exception, chỉ treo.
>
> Cũng đừng pipe output qua `grep`/`tail` rồi `timeout`: khi bị kill, toàn bộ output nằm trong buffer và mất. Ghi thẳng ra file bằng `> file 2>&1`, đọc file sau.

Lưu ý vận hành đã đo được: mỗi lần gọi `omp -p` mất thêm **~60s** chỉ để chờ 2 MCP server (`mongodb`, `sequential-thinking`) timeout. Batch nhiều claim trong **một** lần gọi, đừng gọi 38 lần.

Schema bắt buộc trả về:

```json
[{ "id": "P0-2", "verdict": "CONFIRMED|REFUTED|UNSURE", "severity": "P0|P1|P2", "reason": "..." }]
```

### Giới hạn đã gặp thật trên máy này (2026-10-27)

Headless OMP **không chạy được trong sandbox hiện tại**: lúc khởi động OMP gọi `C:\Windows\System32\reg.exe`, mà `reg.exe` nằm trong Program Blacklist → tiến trình bị chặn, không approve hay bypass được:

```
PROGRAM BLOCKED BY SECURITY POLICY
  - reg.exe (C:\Windows\System32\reg.exe)
```

Đo được: gọi headless trong sandbox treo tới `timeout` (exit 124), sinh **0 byte** output. Lần chạy thành công duy nhất là khi lệnh được cấp escalation (chạy ngoài sandbox).

**Kết luận thực dụng** — đừng dựa vào `omp -p` để cross-check tự động. Hai cách chạy được:

1. **OMP chạy interactive trong session của chính nó** (mở OMP, đưa `claims.json` + repo), OMP ghi verdict ra `omp-verdicts.json`. Sau đó lớp 3 chạy bằng script. Đây là cách khuyến nghị — không phụ thuộc sandbox.
2. **Escalation từng lần**: nếu chấp nhận approve ngoài sandbox mỗi lần, `omp -p` chạy được (đã kiểm chứng bằng ping `OMP_OK`).

Lớp 1 (`verify-claims.mjs`) **không bị ảnh hưởng** — Node thuần, chạy trong sandbox, tất định. Đây là lý do nên coi lớp 1 là xương sống, lớp 2 là bổ sung.

Nếu muốn OMP tự đọc repo (không cần excerpt): bỏ `--no-tools` nhưng phải chấp nhận rủi ro ghi file — khi đó bắt buộc kiểm `git status` trước/sau, và chỉ tin kết quả nếu số dòng dirty không đổi.

## Lớp 3 — so khớp và xử bất đồng

```bash
node scripts/diff-verdicts.mjs \
  plans/reports/audit-261027/verdicts.json \
  plans/reports/audit-261027/omp-verdicts.json
```

Ma trận xử lý:

| Tôi | OMP | Kết luận |
|---|---|---|
| VERIFIED + P0 | CONFIRMED P0 | Đồng thuận — giữ |
| VERIFIED | REFUTED | **Bất đồng thật** — đọc code, bên nào sai thì sửa; ghi lý do vào report |
| VERIFIED | UNSURE | Excerpt thiếu — mở rộng excerpt rồi hỏi lại, đừng hạ mức |
| DRIFT | bất kỳ | Sửa số dòng trước, cross-check lại |
| FAIL | — | Claim sai, xoá khỏi report |

Chỉ được hạ mức severity khi có **bằng chứng**, không hạ vì OMP nói nhẹ hơn. Nếu OMP nói nặng hơn: xem lại, có thể tôi bỏ sót.

## Đã có repo làm sẵn (khỏi tự viết)

| Repo / tool | Làm gì | Khớp nhu cầu? |
|---|---|---|
| `gtsbahamas/gauntlet` (MIT) | Một review engine, 4 checkpoint. `evidence.ts` kiểm **mọi claim với review bundle**, `contract.ts` extract lenient / validate strict / fail loud, có finding identity + memory (dismiss 1 lần là nhớ mãi). BYO agent CLI (`claude -p`, `codex exec`, `copilot`). Core không gọi model, không sửa file. | **Gần nhất.** `claims.json` + `verify-claims.mjs` ở đây là bản rút gọn của evidence layer |
| `repath500/critique-code` (MIT) | Tách author / controller. Transcript và self-report **không** được promote thành evidence; có verified-repair loop. | Mạnh hơn ở "không cho agent tự chấm bài mình" |
| AICodingAgentHarness | Governance layer: evaluator tách khỏi builder, PASS/ITERATE, human gate từng stage | Nặng, thiên về pipeline chứ không phải audit read-only |
| `bigbulgogiburger/claude_jira_harness` → skill `harness-review` | Fan-out review đa agent, gộp verdict PASS/ITERATE/ESCALATE | Gần với `ak-team-lead` |
| **AgentKit `--ultra`** (đã cài sẵn trên máy) | Best-of-5 candidate chạy song song + 1 verifier, evidence packet + rubric, fail-closed nếu không dispatch song song được. Áp cho `ak:code-review`, `ak:test audit`, `ak:scout`, `ak:plan`… | **Có sẵn, không cần cài gì** |

Lưu ý trung thực: `--ultra` là prompt orchestration *lấy cảm hứng* từ LLM-as-a-Verifier — **không** implement logprob-expectation scoring, reward model, hay pivot tournament. Đừng mô tả nó là framework đó.

Điểm mà **không** repo nào ở trên làm thay: kiểm chứng `file:line:anchor` trên **report audit read-only**. Gauntlet làm điều tương đương nhưng gắn với diff/PR, không gắn với claim set của một audit toàn repo. Đó là lý do lớp 1 vẫn đáng giữ.

## Điều cấm

- Không đưa `verdicts.json` cho bên review trước khi họ trả verdict.
- Không sửa `claims.json` sau khi bên kia đã review mà không nói — mất tính so sánh.
- Không dùng "OMP đồng ý" làm bằng chứng thay cho lớp 1. Hai LLM đồng ý với nhau vẫn có thể cùng sai.
