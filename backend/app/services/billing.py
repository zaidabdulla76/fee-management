from decimal import Decimal
from datetime import date
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.hijri import (
    RAMADAN,
    SHAWWAL,
    due_date_for_month,
    next_shawwal_start,
    ramadan_end_date,
)
from app.models.entities import (
    AcademicYear,
    ClassFee,
    FeeType,
    HijriMonth,
    MetaCounter,
    MonthlyBill,
    Student,
    new_id,
)


def next_counter(db: Session, key: str) -> int:
    row = db.query(MetaCounter).filter(MetaCounter.key == key).first()
    if not row:
        row = MetaCounter(id=new_id(), key=key, value=0)
        db.add(row)
        db.flush()
    row.value += 1
    db.flush()
    return row.value


def next_student_code(db: Session) -> str:
    n = next_counter(db, "student_seq")
    return f"STD-{n:04d}"


def next_receipt_no(db: Session, payment_date: date) -> str:
    year = payment_date.year
    n = next_counter(db, f"receipt_{year}")
    return f"RCPT-{year}-{n:05d}"


def get_tuition_fee_type(db: Session) -> FeeType:
    ft = (
        db.query(FeeType)
        .filter(FeeType.mode.in_(["tuition", "enrollment"]) | (FeeType.name == "Tuition"))
        .filter(FeeType.active.is_(True))
        .order_by(FeeType.name.asc())
        .first()
    )
    if not ft:
        ft = db.query(FeeType).filter(FeeType.name == "Tuition").first()
    if not ft:
        raise HTTPException(status_code=500, detail="Tuition fee type is not configured")
    return ft


def get_active_year(db: Session) -> Optional[AcademicYear]:
    return db.query(AcademicYear).filter(AcademicYear.status == "Active").first()


def assert_year_writable(db: Session, year_id: str) -> AcademicYear:
    year = db.get(AcademicYear, year_id)
    if not year:
        raise HTTPException(status_code=404, detail="Academic year not found")
    if year.status == "Frozen":
        raise HTTPException(
            status_code=400,
            detail="This academic year is frozen; bills and payments cannot change",
        )
    return year


def tuition_amount_for_class(db: Session, academic_year_id: str, class_name: str) -> Decimal:
    fee = (
        db.query(ClassFee)
        .filter(ClassFee.academic_year_id == academic_year_id, ClassFee.class_name == class_name)
        .first()
    )
    if not fee:
        raise HTTPException(
            status_code=400,
            detail=f'Set Tuition for class "{class_name}" in Settings before generating bills',
        )
    return Decimal(fee.monthly_amount)


def generate_tuition_bills(db: Session, student: Student, year: AcademicYear) -> list[MonthlyBill]:
    tuition = get_tuition_fee_type(db)
    existing = (
        db.query(MonthlyBill)
        .filter(
            MonthlyBill.student_id == student.id,
            MonthlyBill.academic_year_id == year.id,
            MonthlyBill.fee_type_id == tuition.id,
        )
        .count()
    )
    if existing:
        return (
            db.query(MonthlyBill)
            .filter(
                MonthlyBill.student_id == student.id,
                MonthlyBill.academic_year_id == year.id,
                MonthlyBill.fee_type_id == tuition.id,
            )
            .all()
        )

    amount = tuition_amount_for_class(db, year.id, student.class_name)
    months = db.query(HijriMonth).order_by(HijriMonth.sequence.asc()).all()
    bills = []
    for m in months:
        bill = MonthlyBill(
            id=new_id(),
            student_id=student.id,
            academic_year_id=year.id,
            month_id=m.id,
            fee_type_id=tuition.id,
            fee_item_id=None,
            amount=amount,
            late_fee_amount=Decimal("0"),
            status="Pending",
            due_date=due_date_for_month(year.start_date, m.sequence),
        )
        db.add(bill)
        bills.append(bill)
    db.flush()
    return bills


def enroll_student(db: Session, student_id: str, academic_year_id: str) -> dict:
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    year = assert_year_writable(db, academic_year_id)
    bills = generate_tuition_bills(db, student, year)
    db.commit()
    return {"student_id": student.id, "academic_year_id": year.id, "bills_created": len(bills)}


def latest_year_by_start(db: Session) -> Optional[AcademicYear]:
    return (
        db.query(AcademicYear)
        .order_by(AcademicYear.start_date.desc(), AcademicYear.created_at.desc())
        .first()
    )


def suggest_next_year_start(db: Session) -> dict:
    """FR-3.4 helper for UI: next Shawwal after the chronologically latest year."""
    prev = latest_year_by_start(db)
    if not prev:
        return {
            "suggested_start_date": None,
            "previous_year": None,
            "previous_ramadan_end": None,
            "message": "No prior year — choose the Gregorian date when Shawwal begins.",
        }
    suggested = next_shawwal_start(prev.start_date)
    ramadan_end = ramadan_end_date(prev.start_date)
    return {
        "suggested_start_date": suggested.isoformat(),
        "previous_year": {
            "id": prev.id,
            "year_name": prev.year_name,
            "start_date": prev.start_date.isoformat(),
            "status": prev.status,
        },
        "previous_ramadan_end": ramadan_end.isoformat(),
        "message": (
            f"Next year must start on Shawwal immediately after "
            f"{prev.year_name} Ramadan (ends {ramadan_end.isoformat()}). "
            f"Required start date: {suggested.isoformat()}."
        ),
    }


def create_academic_year(db: Session, year_name: str, start_date: date) -> dict:
    name = (year_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="year_name is required")

    # FR-3.4: after an existing year, Shawwal must begin the day after that year's Ramadan.
    prev = latest_year_by_start(db)
    if prev:
        required = next_shawwal_start(prev.start_date)
        ramadan_end = ramadan_end_date(prev.start_date)
        if start_date != required:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"FR-3.4: new year must start at Shawwal immediately after "
                    f"'{prev.year_name}' Ramadan (ends {ramadan_end.isoformat()}). "
                    f"Use start_date {required.isoformat()}."
                ),
            )
        if start_date <= prev.start_date:
            raise HTTPException(
                status_code=400,
                detail="New academic year start_date must be after the previous year",
            )

    for y in db.query(AcademicYear).filter(AcademicYear.status == "Active").all():
        y.status = "Frozen"

    year = AcademicYear(
        id=new_id(),
        year_name=name,
        start_month=SHAWWAL,
        end_month=RAMADAN,
        start_date=start_date,
        status="Active",
    )
    db.add(year)
    db.flush()

    warnings = []
    students = db.query(Student).filter(Student.status == "Active").all()
    for s in students:
        try:
            generate_tuition_bills(db, s, year)
        except HTTPException as exc:
            warnings.append(f"{s.student_code}: {exc.detail}")
    db.commit()
    db.refresh(year)
    return {"year": year, "warning": "; ".join(warnings) if warnings else None}
