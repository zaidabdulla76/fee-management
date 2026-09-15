from decimal import Decimal
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.hijri import today
from app.models.entities import AcademicYear, FeeType, LateFeeSetting, MonthlyBill
from app.services.billing import get_tuition_fee_type


def _late_fee_for_bill(setting: LateFeeSetting, base_amount: Decimal) -> Decimal:
    if setting.late_fee_type == "Percent":
        value = Decimal(str(setting.late_fee_value))
        fee = (base_amount * value / Decimal("100")).quantize(Decimal("0.01"))
        return fee if fee >= Decimal("0") else Decimal("0")
    # Flat
    return Decimal(str(setting.late_fee_value)).quantize(Decimal("0.01"))


def apply_late_fees(db: Session) -> dict:
    """
    FR-10.3: Flag Tuition bills past due_date + grace_period as Overdue
    and stamp late_fee_amount. Tuition-only, single system-wide rule.
    Idempotent: already Overdue rows are not re-processed.
    """
    setting = db.query(LateFeeSetting).first()
    if not setting:
        return {"updated": 0, "message": "No late fee rule configured"}

    try:
        grace = int(setting.grace_period_days or 0)
    except Exception:
        grace = 0
    if grace < 0:
        grace = 0

    try:
        tuition = get_tuition_fee_type(db)
    except Exception:
        return {"updated": 0, "message": "Tuition fee type not configured"}

    now = today()
    # Only Pending bills with a due_date can become Overdue
    candidates = (
        db.query(MonthlyBill)
        .filter(
            MonthlyBill.fee_type_id == tuition.id,
            MonthlyBill.status == "Pending",
            MonthlyBill.due_date.isnot(None),
        )
        .all()
    )

    # AcademicYear lookup for Frozen guard (FR-3.5)
    year_cache: dict[str, AcademicYear | None] = {}
    updated = 0
    for bill in candidates:
        if bill.due_date is None:
            continue
        due_plus_grace = bill.due_date + timedelta(days=grace)
        if now <= due_plus_grace:
            continue

        # Frozen years must never change (FR-3.5)
        yid = bill.academic_year_id
        if yid not in year_cache:
            year_cache[yid] = db.get(AcademicYear, yid)
        year = year_cache[yid]
        if year is not None and year.status == "Frozen":
            continue

        # Non-tuition bills have due_date=None, already excluded; tuition only here
        base = Decimal(bill.amount)
        fee = _late_fee_for_bill(setting, base)
        bill.status = "Overdue"
        bill.late_fee_amount = fee
        updated += 1

    if updated:
        db.commit()
    return {"updated": updated, "grace_period_days": grace, "late_fee_type": setting.late_fee_type, "late_fee_value": float(setting.late_fee_value)}
