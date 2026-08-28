from decimal import Decimal
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.hijri import today
from app.models.entities import FeeType, LateFeeSetting, MonthlyBill


def apply_late_fees(db: Session) -> dict:
    setting = db.query(LateFeeSetting).first()
    if not setting:
        return {"updated": 0}

    enrollment_ids = [
        t.id for t in db.query(FeeType).filter(FeeType.mode == "enrollment").all()
    ]
    if not enrollment_ids:
        return {"updated": 0}

    bills = (
        db.query(MonthlyBill)
        .filter(
            MonthlyBill.fee_type_id.in_(enrollment_ids),
            MonthlyBill.status.in_(["Pending", "Overdue"]),
            MonthlyBill.due_date.isnot(None),
        )
        .all()
    )

    current = today()
    updated = 0
    for bill in bills:
        overdue_after = bill.due_date + timedelta(days=setting.grace_period_days or 0)
        if current <= overdue_after:
            continue
        if setting.late_fee_type == "Percent":
            late = (Decimal(bill.amount) * Decimal(setting.late_fee_value) / Decimal("100")).quantize(
                Decimal("0.01")
            )
        else:
            late = Decimal(setting.late_fee_value)

        if bill.status != "Overdue" or Decimal(bill.late_fee_amount or 0) != late:
            bill.status = "Overdue"
            bill.late_fee_amount = late
            updated += 1

    db.commit()
    return {"updated": updated, "message": f"{updated} bills flagged"}
