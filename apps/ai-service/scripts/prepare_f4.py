"""Explicit, one-time public artifact setup. Defaults to resource report; no download."""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import sys
import urllib.request
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.f4_encoder import MODEL, REVISION, SEGMENTER_REVISION

def resources(destination: Path):
    class Memory(ctypes.Structure):
        _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [(name, ctypes.c_ulonglong) for name in ["total", "available", "page", "available_page", "virtual", "available_virtual", "extended"]]
    available = None
    if os.name == "nt":
        memory = Memory(); memory.length = ctypes.sizeof(Memory)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
            available = memory.available
    ancestor = destination.resolve()
    while not ancestor.exists(): ancestor = ancestor.parent
    free = shutil.disk_usage(ancestor).free
    # Conservative engineering budget, not a benchmark or business policy.
    return {"python": platform.python_version(), "platform": platform.platform(), "availableRamBytes": available, "freeDiskBytes": free,
            "requiredAvailableRamBytes": 2684354560, "requiredFreeDiskBytes": 4294967296,
            "ready": available is not None and available >= 2684354560 and free >= 4294967296}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    report = resources(args.destination)
    print(json.dumps(report))
    if not args.download: return
    if not report["ready"]: raise SystemExit("F4_INSTALL_BLOCKED_RESOURCE_BUDGET: no installation or download attempted")
    from huggingface_hub import snapshot_download
    root = args.destination.resolve(); model_dir = root / "phobert-base"; segmenter_dir = root / "vncorenlp"
    if (model_dir / "artifact-manifest.json").exists() or (segmenter_dir / "artifact-manifest.json").exists():
        raise SystemExit("Existing artifacts retained; use offline runtime rather than downloading again")
    snapshot_download(MODEL, revision=REVISION, token=False, local_dir=str(model_dir), allow_patterns=["config.json", "pytorch_model.bin", "bpe.codes", "vocab.txt"])
    assets = ["VnCoreNLP-1.2.jar", "models/wordsegmenter/vi-vocab", "models/wordsegmenter/wordsegmenter.rdr"]
    for name in assets:
        target = segmenter_dir / name; target.parent.mkdir(parents=True, exist_ok=True)
        url = "https://raw.githubusercontent.com/vncorenlp/VnCoreNLP/" + SEGMENTER_REVISION + "/" + name
        with urllib.request.urlopen(url, timeout=60) as response, target.open("xb") as handle:
            shutil.copyfileobj(response, handle)
    for folder, revision, names in [(model_dir, REVISION, ["config.json", "pytorch_model.bin", "bpe.codes", "vocab.txt"]), (segmenter_dir, SEGMENTER_REVISION, assets)]:
        files = {}
        for name in names:
            digest = hashlib.sha256()
            with (folder / name).open("rb") as handle:
                for chunk in iter(lambda: handle.read(1048576), b""): digest.update(chunk)
            files[name] = digest.hexdigest()
        (folder / "artifact-manifest.json").write_text(json.dumps({"revision": revision, "files": files}, indent=2), encoding="utf-8")

if __name__ == "__main__": main()
