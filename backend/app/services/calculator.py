"""
Safe arithmetic evaluator.

`eval()` is never used.  The expression is parsed to an AST and only a
whitelist of numeric nodes/operators/functions is executed, so a malicious
utterance cannot reach the filesystem or the interpreter.
"""

from __future__ import annotations

import ast
import math
import operator as op
import re
from typing import Any

_BIN_OPS = {
    ast.Add: op.add,
    ast.Sub: op.sub,
    ast.Mult: op.mul,
    ast.Div: op.truediv,
    ast.FloorDiv: op.floordiv,
    ast.Mod: op.mod,
    ast.Pow: op.pow,
}
_UNARY_OPS = {ast.UAdd: op.pos, ast.USub: op.neg}

_FUNCS: dict[str, Any] = {
    "sqrt": math.sqrt, "abs": abs, "round": round, "floor": math.floor,
    "ceil": math.ceil, "log": math.log, "log10": math.log10, "exp": math.exp,
    "sin": math.sin, "cos": math.cos, "tan": math.tan, "pow": math.pow,
    "min": min, "max": max,
}
_CONSTS = {"pi": math.pi, "e": math.e}

# Spoken-word -> symbol so "five plus three" and "20 percent of 500" work.
_WORDS = [
    (r"\bplus\b|\badd\b|\bजोड़\w*\b|\baur\b", "+"),
    (r"\bminus\b|\bsubtract\b|\bघटा\w*\b", "-"),
    (r"\btimes\b|\bmultiplied by\b|\binto\b|\bx\b|\bगुणा\b", "*"),
    (r"\bdivided by\b|\bdivide\b|\bbatta\b|\bभाग\b", "/"),
    (r"\bpower of\b|\braised to\b|\bghat\b", "**"),
    (r"\bpercent of\b|\b%\s*of\b|\bप्रतिशत\b", "/100*"),
    (r"\bpercent\b", "/100"),
]


_NUM_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "eleven": "11", "twelve": "12", "twenty": "20", "thirty": "30",
    "forty": "40", "fifty": "50", "hundred": "100", "thousand": "1000",
    "ek": "1", "do": "2", "teen": "3", "char": "4", "paanch": "5",
    "एक": "1", "दो": "2", "तीन": "3", "चार": "4", "पांच": "5",
}


def normalise_expression(text: str) -> str:
    expr = (text or "").lower().strip().rstrip("=?")
    expr = re.sub(r"\b(what\s+is|calculate|compute|solve|kitna\s+hota\s+hai|hisaab\s+lagao)\b", "", expr)
    for pattern, symbol in _WORDS:
        expr = re.sub(pattern, symbol, expr)
    for word, digit in _NUM_WORDS.items():          # "five plus three" -> "5+3"
        expr = re.sub(rf"\b{word}\b", digit, expr)
    expr = expr.replace("^", "**").replace(",", "")
    expr = re.sub(r"[^0-9a-z_+\-*/%.()\s]", "", expr)
    return expr.strip()


def _eval(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError("Only numbers are allowed")
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
        return _BIN_OPS[type(node.op)](_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return _UNARY_OPS[type(node.op)](_eval(node.operand))
    if isinstance(node, ast.Name) and node.id in _CONSTS:
        return _CONSTS[node.id]
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _FUNCS:
        return float(_FUNCS[node.func.id](*[_eval(a) for a in node.args]))
    raise ValueError("Unsupported expression")


def calculate(text: str) -> dict[str, Any]:
    """Return {ok, expression, result, spoken}."""
    expr = normalise_expression(text)
    if not expr or not re.search(r"\d", expr):
        return {"ok": False, "error": "No numbers found", "expression": expr}
    try:
        value = _eval(ast.parse(expr, mode="eval"))
    except ZeroDivisionError:
        return {"ok": False, "error": "Division by zero", "expression": expr}
    except Exception:  # noqa: BLE001 - any parse failure is a user error
        return {"ok": False, "error": "I could not understand that calculation", "expression": expr}

    if value == int(value) and abs(value) < 1e15:
        pretty: Any = int(value)
    else:
        pretty = round(value, 6)
    return {
        "ok": True,
        "expression": expr,
        "result": pretty,
        "spoken": f"{expr.replace('**', ' to the power ')} equals {pretty}",
    }
