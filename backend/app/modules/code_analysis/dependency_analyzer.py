"""Mirrors: backend/src/modules/code-analysis/dependency-analyzer.ts"""
import json
import os


async def detect_dependencies(root: str) -> dict:
    pkg_path = os.path.join(root, "package.json")
    try:
        with open(pkg_path, "r", encoding="utf-8") as f:
            pkg = json.load(f)
        return {
            "runtime": pkg.get("dependencies", {}),
            "development": pkg.get("devDependencies", {}),
        }
    except (FileNotFoundError, json.JSONDecodeError):
        return {"runtime": {}, "development": {}}
