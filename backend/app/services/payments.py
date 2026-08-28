from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.entities import FeeItem, FeeType, MonthlyBill, Payment, Student, new_id
from app.services.billing import assert_year_writable, next_receipt_no


def collect_non_tuition(
    db: Session,
    *,
    student_id: str,
    academic_year_id: str,
    fee_type_id: str,
    fee_item_id: str,
    payment_date: date,
    payment_mode: str,
    receipt_no: str | None,
    remarks: str | None,
    created_by: str | None,
) -> dict:
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    assert_year_writable(db, academic_year_id)

    fee_type = db.get(FeeType, fee_type_id)
    if not fee_type or not fee_type.active:
        raise HTTPException(status_code=404, detail="Fee type not found")
    if fee_type.mode != "collection":
        raise HTTPException(status_code=400, detail="Use Tuition payment flow for enrollment-based fees")

    item = db.get(FeeItem, fee_item_id)
    if not item or item.fee_type_id != fee_type_id or not item.active:
        raise HTTPException(status_code=404, detail="Fee item not found or inactive")

    if payment_mode not in ("cash", "UPI", "bank"):
        raise HTTPException(status_code=400, detail="payment_mode must be cash, UPI, or bank")

    amount = Decimal(item.price)
    receipt = (receipt_no or "").strip() or next_receipt_no(db, payment_date)

    bill = MonthlyBill(
        id=new_id(),
        student_id=student_id,
        academic_year_id=academic_year_id,
        month_id=None,
        fee_type_id=fee_type_id,
        fee_item_id=fee_item_id,
        amount=amount,
        late_fee_amount=Decimal("0"),
        status="Paid",
        due_date=None,
    )
    payment = Payment(
        id=new_id(),
        bill_id=bill.id,
        payment_date=payment_date,
        amount=amount,
        base_amount=amount,
        late_fee_amount=Decimal("0"),
        payment_mode=payment_mode,
        receipt_no=receipt,
        remarks=remarks or "",
        created_by=created_by,
    )
    # Single transaction: both rows or neither
    db.add(bill)
    db.add(payment)
    db.commit()
    db.refresh(bill)
    db.refresh(payment)
    return {
        "bill": bill,
        "payment": payment,
        "fee_type": fee_type,
        "fee_item": item,
        "student": student,
    }


def pay_tuition_bill(
    db: Session,
    *,
    bill_id: str,
    payment_date: date,
    payment_mode: str,
    receipt_no: str | None,
    remarks: str | None,
    created_by: str | None,
) -> dict:
    from app.services.late_fee import apply_late_fees

    apply_late_fees(db)
    bill = db.get(MonthlyBill, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.status == "Paid":
        raise HTTPException(status_code=400, detail="Bill is already paid")
    assert_year_writable(db, bill.academic_year_id)

    if payment_mode not in ("cash", "UPI", "bank"):
        raise HTTPException(status_code=400, detail="payment_mode must be cash, UPI, or bank")

    expected = Decimal(bill.amount) + Decimal(bill.late_fee_amount or 0)
    receipt = (receipt_no or "").strip() or next_receipt_no(db, payment_date)
    payment = Payment(
        id=new_id(),
        bill_id=bill.id,
        payment_date=payment_date,
        amount=expected,
        base_amount=Decimal(bill.amount),
        late_fee_amount=Decimal(bill.late_fee_amount or 0),
        payment_mode=payment_mode,
        receipt_no=receipt,
        remarks=remarks or "",
        created_by=created_by,
    )
    bill.status = "Paid"
    db.add(payment)
    db.commit()
    db.refresh(payment)
    db.refresh(bill)
    return {"payment": payment, "bill": bill}
