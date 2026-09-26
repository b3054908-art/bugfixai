"""Mirrors: backend/src/modules/code-analysis/symbol-indexer.ts"""
import os

from app.modules.code_analysis.ast_service import CodeSymbol, extract_simple_symbols

_SKIP_DIRS = {".git", "node_modules", "dist", "build"}
_CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"}


async def build_symbol_index(root: str) -> list[CodeSymbol]:
    result: list[CodeSymbol] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
        for name in filenames:
            if os.path.splitext(name)[1] not in _CODE_EXT:
                continue
            full = os.path.join(dirpath, name)
            try:
                with open(full, "r", encoding="utf-8") as f:
                    text = f.read()
            except (OSError, UnicodeDecodeError):
                continue
            rel = os.path.relpath(full, root)
            result.extend(extract_simple_symbols(rel, text))
    return result
