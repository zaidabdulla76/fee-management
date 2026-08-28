"""Smoke-test APIs that power each UI screen."""
from __future__ import annotations

import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
FE = "http://127.0.0.1:5173"


def req(method: str, url: str, token: str | None = None, data=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as res:
            raw = res.read().decode()
            parsed = json.loads(raw) if raw and "application/json" in (res.headers.get("Content-Type") or "") else raw
            if isinstance(parsed, str) and parsed.startswith("{") or (isinstance(parsed, str) and parsed.startswith("[")):
                try:
                    parsed = json.loads(parsed)
                except Exception:
                    pass
            return res.status, parsed
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")[:160]
        return e.code, {"error": detail}
    except Exception as e:
        return "ERR", {"error": str(e)}


def hit(name: str, method: str, path: str, token: str | None = None, data=None, base: str = BASE):
    status, body = req(method, base + path, token, data)
    ok = str(status).startswith("2")
    mark = "OK  " if ok else "FAIL"
    print(f"{mark} {name:<30} {status}  {path}")
    return body if ok else None


def main():
    status, login = req("POST", f"{BASE}/api/auth/login", data={"username": "admin", "password": "admin123"})
    print(f"{'OK  ' if status == 200 else 'FAIL'} {'Login':<30} {status}  /api/auth/login")
    if status != 200 or not isinstance(login, dict) or not login.get("token"):
        print("ABORT: cannot login", login)
        return
    token = login["token"]

    hit("Auth session (/me)", "GET", "/api/auth/me", token)
    hit("Health", "GET", "/api/health", token)
    years = hit("School years list", "GET", "/api/academic-years", token) or []
    hit("Next year suggestion", "GET", "/api/academic-years/next-start", token)
    year_id = years[0]["id"] if years else None
    print(f"     years={len(years)} year_id={year_id}")

    hit(
        "Home / Dashboard",
        "GET",
        f"/api/dashboard?academicYearId={year_id}" if year_id else "/api/dashboard",
        token,
    )

    students = hit("Students list", "GET", "/api/students", token) or []
    print(f"     students={len(students)}")
    sid = students[0]["id"] if students else None
    if sid:
        hit("Student detail", "GET", f"/api/students/{sid}", token)
        if year_id:
            hit("Student tuition grid", "GET", f"/api/students/{sid}/years/{year_id}/tuition", token)
        hit("Student payment history", "GET", f"/api/students/{sid}/payments", token)
        hit("Report: student ledger", "GET", f"/api/reports/student-ledger/{sid}", token)

    types = hit("Setup: fee types", "GET", "/api/settings/fee-types", token) or []
    coll = next((t for t in types if t.get("mode") == "collection"), None)
    if coll:
        items = hit("Collect: fee items", "GET", f"/api/fee-types/{coll['id']}/items", token) or []
        print(f"     collection={coll.get('name')} items={len(items)}")

    hit("Setup: classes", "GET", "/api/settings/classes", token)
    hit("Setup: late fee", "GET", "/api/settings/late-fee", token)
    hit("Setup: fee items", "GET", "/api/settings/fee-items", token)
    if year_id:
        hit("Setup: tuition prices", "GET", f"/api/settings/class-fees?academicYearId={year_id}", token)
        for label, path in [
            ("Report: tuition status", f"/api/reports/tuition-status?academicYearId={year_id}"),
            ("Report: collections", f"/api/reports/collections-by-type?academicYearId={year_id}"),
            ("Report: outstanding", f"/api/reports/outstanding-tuition?academicYearId={year_id}"),
            ("Report: year summary", f"/api/reports/year-summary?academicYearId={year_id}"),
        ]:
            hit(label, "GET", path, token)

    st, _ = req("GET", FE + "/")
    print(f"{'OK  ' if st == 200 else 'FAIL'} {'Frontend (Vite)':<30} {st}  /")
    st, _ = req("GET", FE + "/login")
    print(f"{'OK  ' if st == 200 else 'FAIL'} {'Frontend login route':<30} {st}  /login")


if __name__ == "__main__":
    main()
