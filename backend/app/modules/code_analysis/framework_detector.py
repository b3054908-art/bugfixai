"""Mirrors: backend/src/modules/code-analysis/framework-detector.ts"""
import json
import os


async def detect_framework(root: str) -> str:
    pkg_path = os.path.join(root, "package.json")
    try:
        with open(pkg_path, "r", encoding="utf-8") as f:
            pkg = json.load(f)
        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        if "next" in deps:
            return "Next.js"
        if "react" in deps:
            return "React"
        if "@nestjs/core" in deps:
            return "NestJS"
        if "express" in deps:
            return "Express"
        if "vite" in deps:
            return "Vite"
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    req_path = os.path.join(root, "requirements.txt")
    try:
        with open(req_path, "r", encoding="utf-8") as f:
            requirements = f.read().lower()
        if "fastapi" in requirements:
            return "FastAPI"
        if "django" in requirements:
            return "Django"
        if "flask" in requirements:
            return "Flask"
    except FileNotFoundError:
        pass

    return "Unknown"
