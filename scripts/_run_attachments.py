import sys, runpy
from dotenv import load_dotenv
load_dotenv(r"C:/work-space/hr-blockbot/.env")
sys.argv = ["13-policy-attachments.py", "--apply"]
runpy.run_path(r"C:/work-space/worktrees/hr-blockbot-f4-kpi-notifications/scripts/seed/13-policy-attachments.py", run_name="__main__")
