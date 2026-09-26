"""Mirrors: backend/src/modules/code-analysis/project-inspector.ts

UPDATED: entryPoints used to check for manifest/config files (package.json,
requirements.txt, etc.) -- those describe dependencies, not runnable files,
so the field was computed and then never actually consumed anywhere.
Replaced with detect_entry_point() (a real "which file runs this app"
check) and detect_database() (net-new), both consumed by later phases --
see detectors.py's detect_preview() and pipeline_runner.py's Phase 7/5.
"""
import os

from app.modules.code_analysis.database_detector import detect_database
from app.modules.code_analysis.dependency_analyzer import detect_dependencies
from app.modules.code_analysis.entry_point_detector import detect_entry_point
from app.modules.code_analysis.framework_detector import detect_framework
from app.modules.code_analysis.language_detector import detect_language
from app.modules.code_analysis.symbol_indexer import build_symbol_index


async def inspect_project(root: str) -> dict:
    language = await detect_language(root)
    framework = await detect_framework(root)
    dependencies = await detect_dependencies(root)
    symbols = await build_symbol_index(root)
    entry_point = await detect_entry_point(root, language)
    database = await detect_database(root, language)

    return {
        "language": language,
        "framework": framework,
        "dependencies": dependencies,
        "symbolCount": len(symbols),
        "entryPoint": entry_point,
        "database": database,
        "root": os.path.abspath(root),
    }
