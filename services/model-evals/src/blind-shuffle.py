#!/usr/bin/env python3
"""Blind-grading shuffle — legal-ledger-grading.md protocol.

seed = sha256(run_commit_hash) -> deterministic permutation of (candidates x tasks).
Writes grading/shuffled/<NN>.json with ONLY scenario id + response text
(model identity, token counts and costs stripped — token counts could
fingerprint a model). The index->model key is written sealed; its sha256 is
printed so the key can be committed-before-grading and verified at unseal.

Usage: blind-shuffle.py <run_commit_hash> <out_dir> <run_dir:model_label> [...]
"""
import hashlib
import json
import random
import sys
from pathlib import Path

commit = sys.argv[1]
out = Path(sys.argv[2])
runs = [a.split(":", 1) for a in sys.argv[3:]]

pairs = []  # (model_label, task_file)
for run_dir, label in runs:
    for f in sorted(Path(run_dir).glob("legal-ledger-*.json")):
        pairs.append((label, f))

seed = int.from_bytes(hashlib.sha256(commit.encode()).digest()[:8], "big")
random.Random(seed).shuffle(pairs)

shuffled_dir = out / "shuffled"
shuffled_dir.mkdir(parents=True, exist_ok=True)
key = {}
for idx, (label, f) in enumerate(pairs, 1):
    raw = json.loads(f.read_text())
    (shuffled_dir / f"{idx:02d}.json").write_text(json.dumps({
        "shuffledId": idx,
        "taskId": raw["taskId"],
        "response": raw["response"],
    }, indent=1))
    key[str(idx)] = {"model": label, "source": str(f)}

key_path = out / "grading-key.json.sealed"
key_path.write_text(json.dumps(key, indent=1))
key_sha = hashlib.sha256(key_path.read_bytes()).hexdigest()
print(f"shuffled: {len(pairs)} responses -> {shuffled_dir}")
print(f"sealed key: {key_path}")
print(f"key sha256: {key_sha}")
print(f"seed commit: {commit}")
