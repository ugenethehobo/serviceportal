import json
from pathlib import Path

path = Path(
    r"C:\Users\ugene\.grok\sessions\C%3A%5CUsers%5Cugene%5C.grok%5Cworktrees%5Cdocuments-service-portal-v2%5C2026-07-02-bee4af6a\019f6dcb-e367-7773-8fb9-6c3e58379d60\chat_history.jsonl"
)

keywords = ("multi-tech", "p4", "helper tech", "lead role", "job helper", "secondary")

for line in path.read_text(encoding="utf-8").splitlines():
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        continue
    if obj.get("type") != "assistant":
        continue
    content = obj.get("content") or ""
    if not isinstance(content, str):
        continue
    lower = content.lower()
    if any(k in lower for k in keywords) and (
        "roadmap" in lower or "phase" in lower or "gap" in lower or "recommend" in lower
    ):
        # print relevant sections
        for i, para in enumerate(content.split("\n")):
            if any(k in para.lower() for k in keywords + ("crew lead", "helpers")):
                start = max(0, i - 2)
                end = min(len(content.split("\n")), i + 8)
                lines = content.split("\n")
                print("\n".join(lines[start:end]))
                print("---")
