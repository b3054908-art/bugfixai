"""Mirrors: backend/src/modules/code-analysis/ast.service.ts"""
import re
from dataclasses import dataclass

_SYMBOL_RE = re.compile(r"\b(?:function|def|func|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)")


@dataclass
class CodeSymbol:
    file: str
    name: str
    kind: str
    line: int


def extract_simple_symbols(file: str, content: str) -> list[CodeSymbol]:
    symbols: list[CodeSymbol] = []
    for index, line in enumerate(content.split("\n")):
        match = _SYMBOL_RE.search(line)
        if match:
            symbols.append(CodeSymbol(file=file, name=match.group(1), kind="declaration", line=index + 1))
    return symbols
