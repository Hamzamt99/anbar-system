"""Order an untouched D1 SQL export for foreign-key-safe import into an EMPTY target.
No database connection; input/output may contain sensitive data. Never print SQL.
"""
import sqlite3
import sys
from pathlib import Path
source, target = map(Path, sys.argv[1:])
statements, buffer = [], ""
for character in source.read_text():
    buffer += character
    if character == ";" and sqlite3.complete_statement(buffer):
        statements.append(buffer.strip())
        buffer = ""
if buffer.strip():
    raise ValueError("Incomplete SQL export")
def statement_kind(statement):
    clean = "\n".join(line for line in statement.splitlines() if not line.lstrip().startswith("--")).lstrip().upper()
    if clean.startswith("CREATE TABLE"): return 0
    if clean.startswith("INSERT INTO"): return 1
    if clean.startswith("CREATE "): return 2
    if clean.startswith(("PRAGMA", "BEGIN TRANSACTION", "COMMIT")): return -1
    if clean.startswith("DELETE FROM SQLITE_SEQUENCE"): return 1
    raise ValueError("Unexpected export statement kind: " + clean.split()[0])
ordered = sorted((s for s in statements if statement_kind(s) >= 0), key=statement_kind)
target.write_text("PRAGMA defer_foreign_keys=ON;\n" + "\n".join(ordered) + "\nPRAGMA defer_foreign_keys=OFF;\n")
target.chmod(0o600)
