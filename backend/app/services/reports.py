from decimal import Decimal
from io import BytesIO
from typing import Optional

from fastapi import HTTPException
from openpyxl import Workbook
from sqlalchemy.orm import Session

from app.models.entities import (
    AcademicYear,
    FeeItem,
    FeeType,
    HijriMonth,
    MonthlyBill,
    Payment,
    Student,
)
from app.services.billing import get_tuition_fee_type
from app.services.late_fee import apply_late_fees


def _year(db: Session, academic_year_id: str) -> AcademicYear:
    if not academic_year_id:
        raise HTTPException(status_code=400, detail="academicYearId is required")
    year = db.get(AcademicYear, academic_year_id)
    if not year:
        raise HTTPException(status_code=404, detail="Academic year not found")
    apply_late_fees(db)
    return year


def report_tuition_status(db: Session, academic_year_id: str) -> dict:
    year = _year(db, academic_year_id)
    tuition = get_tuition_fee_type(db)
    bills = (
        db.query(MonthlyBill)
        .filter(
            MonthlyBill.academic_year_id == year.id,
            MonthlyBill.fee_type_id == tuition.id,
        )
        .all()
    )
    by_student: dict[str, list] = {}
    for b in bills:
        by_student.setdefault(b.student_id, []).append(b)

    rows = []
    for sid, sbills in by_student.items():
        student = db.get(Student, sid)
        if not student:
            continue
        pending = [b for b in sbills if b.status != "Paid"]
        rows.append(
            {
                "student": {
                    "id": student.id,
                    "student_code": student.student_code,
                    "name": student.name,
                    "class": student.class_name,
                },
                "total_months": len(sbills),
                "paid_months": len(sbills) - len(pending),
                "pending_months": len(pending),
                "status": "Pending" if pending else "Paid",
                "outstanding": float(
                    sum(Decimal(b.amount) + Decimal(b.late_fee_amount or 0) for b in pending)
                ),
            }
        )
    rows.sort(key=lambda r: r["student"]["name"])
    return {"year": _year_dict(year), "rows": rows}


def report_collections_by_type(db: Session, academic_year_id: str) -> dict:
    year = _year(db, academic_year_id)
    bills = db.query(MonthlyBill).filter(MonthlyBill.academic_year_id == year.id).all()
    bill_map = {b.id: b for b in bills}
    payments = db.query(Payment).filter(Payment.bill_id.in_(list(bill_map.keys()) or ["__none__"])).all()
    types = {t.id: t for t in db.query(FeeType).all()}
    items = {i.id: i for i in db.query(FeeItem).all()}

    by_type: dict = {}
    late_fees = Decimal("0")
    for p in payments:
        bill = bill_map[p.bill_id]
        tname = types.get(bill.fee_type_id).name if bill.fee_type_id in types else "Unknown"
        bucket = by_type.setdefault(tname, {"fee_type": tname, "total": 0.0, "count": 0, "items": {}})
        bucket["total"] += float(p.amount)
        bucket["count"] += 1
        late_fees += Decimal(p.late_fee_amount or 0)
        if bill.fee_item_id:
            label = items[bill.fee_item_id].label if bill.fee_item_id in items else "Unknown"
            item = bucket["items"].setdefault(label, {"label": label, "total": 0.0, "count": 0})
            item["total"] += float(p.amount)
            item["count"] += 1

    rows = []
    for r in by_type.values():
        rows.append({**r, "items": list(r["items"].values())})
    return {"year": _year_dict(year), "lateFeesCollected": float(late_fees), "rows": rows}


def report_outstanding(db: Session, academic_year_id: str) -> dict:
    year = _year(db, academic_year_id)
    tuition = get_tuition_fee_type(db)
    months = {m.id: m for m in db.query(HijriMonth).all()}
    bills = (
        db.query(MonthlyBill)
        .filter(
            MonthlyBill.academic_year_id == year.id,
            MonthlyBill.fee_type_id == tuition.id,
            MonthlyBill.status.in_(["Pending", "Overdue"]),
        )
        .all()
    )
    rows = []
    for b in bills:
        s = db.get(Student, b.student_id)
        if not s:
            continue
        month = months.get(b.month_id)
        rows.append(
            {
                "student": {
                    "id": s.id,
                    "student_code": s.student_code,
                    "name": s.name,
                    "class": s.class_name,
                },
                "month": {"id": month.id, "month_name": month.month_name, "sequence": month.sequence}
                if month
                else None,
                "bill": _bill_dict(b),
                "total_due": float(Decimal(b.amount) + Decimal(b.late_fee_amount or 0)),
            }
        )
    rows.sort(key=lambda r: r["student"]["name"])
    return {"year": _year_dict(year), "rows": rows}


def report_year_summary(db: Session, academic_year_id: str) -> dict:
    status = report_tuition_status(db, academic_year_id)
    collections = report_collections_by_type(db, academic_year_id)
    outstanding = report_outstanding(db, academic_year_id)
    return {
        "year": status["year"],
        "active_students_with_tuition": len(status["rows"]),
        "fully_paid_students": len([r for r in status["rows"] if r["status"] == "Paid"]),
        "students_with_dues": len([r for r in status["rows"] if r["status"] == "Pending"]),
        "total_collected": sum(r["total"] for r in collections["rows"]),
        "late_fees_collected": collections["lateFeesCollected"],
        "outstanding_amount": sum(r["total_due"] for r in outstanding["rows"]),
        "collections_by_type": collections["rows"],
    }


def report_student_ledger(db: Session, student_id: str) -> dict:
    apply_late_fees(db)
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    bills = db.query(MonthlyBill).filter(MonthlyBill.student_id == student_id).all()
    bill_map = {b.id: b for b in bills}
    payments = db.query(Payment).filter(Payment.bill_id.in_(list(bill_map.keys()) or ["__none__"])).all()
    types = {t.id: t for t in db.query(FeeType).all()}
    items = {i.id: i for i in db.query(FeeItem).all()}
    months = {m.id: m for m in db.query(HijriMonth).all()}
    years = {y.id: y for y in db.query(AcademicYear).all()}

    rows = []
    for p in payments:
        b = bill_map[p.bill_id]
        rows.append(
            {
                "kind": "payment",
                "date": p.payment_date.isoformat(),
                "fee_type": types.get(b.fee_type_id).name if b.fee_type_id in types else None,
                "fee_item": items.get(b.fee_item_id).label if b.fee_item_id and b.fee_item_id in items else None,
                "month": months.get(b.month_id).month_name if b.month_id and b.month_id in months else None,
                "academic_year": years.get(b.academic_year_id).year_name if b.academic_year_id in years else None,
                "status": "Paid",
                "amount": float(p.amount),
                "base_amount": float(p.base_amount),
                "late_fee_amount": float(p.late_fee_amount or 0),
                "receipt_no": p.receipt_no,
                "payment_mode": p.payment_mode,
            }
        )
    for b in bills:
        if b.status == "Paid":
            continue
        rows.append(
            {
                "kind": "bill",
                "date": b.due_date.isoformat() if b.due_date else None,
                "fee_type": types.get(b.fee_type_id).name if b.fee_type_id in types else None,
                "fee_item": items.get(b.fee_item_id).label if b.fee_item_id and b.fee_item_id in items else None,
                "month": months.get(b.month_id).month_name if b.month_id and b.month_id in months else None,
                "academic_year": years.get(b.academic_year_id).year_name if b.academic_year_id in years else None,
                "status": b.status,
                "amount": float(Decimal(b.amount) + Decimal(b.late_fee_amount or 0)),
                "base_amount": float(b.amount),
                "late_fee_amount": float(b.late_fee_amount or 0),
                "receipt_no": None,
                "payment_mode": None,
            }
        )
    return {
        "student": {
            "id": student.id,
            "student_code": student.student_code,
            "name": student.name,
            "class": student.class_name,
        },
        "rows": rows,
    }


def export_xlsx(title: str, headers: list[str], rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = title[:31]
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_pdf(title: str, lines: list[str]) -> bytes:
    body = "".join(f"<p>{line}</p>" for line in lines)
    html = f"<html><body><h1>{title}</h1>{body}</body></html>"
    try:
        from weasyprint import HTML

        return HTML(string=html).write_pdf()
    except Exception:
        # Fallback for environments without WeasyPrint system libs
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas

        buf = BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        width, height = A4
        y = height - 50
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, y, title)
        y -= 28
        c.setFont("Helvetica", 10)
        for line in lines:
            if y < 50:
                c.showPage()
                y = height - 50
                c.setFont("Helvetica", 10)
            c.drawString(50, y, line[:110])
            y -= 14
        c.save()
        return buf.getvalue()


def _year_dict(year: AcademicYear) -> dict:
    return {
        "id": year.id,
        "year_name": year.year_name,
        "start_month": year.start_month,
        "end_month": year.end_month,
        "start_date": year.start_date.isoformat(),
        "status": year.status,
    }


def _bill_dict(b: MonthlyBill) -> dict:
    return {
        "id": b.id,
        "amount": float(b.amount),
        "late_fee_amount": float(b.late_fee_amount or 0),
        "status": b.status,
        "due_date": b.due_date.isoformat() if b.due_date else None,
    }
