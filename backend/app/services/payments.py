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
    if fee_type.mode not in ("collection", "admission"):
        raise HTTPException(status_code=400, detail="Use Tuition payment flow for tuition fees")

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
    bill = db.get(MonthlyBill, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.status == "Paid":
        raise HTTPException(status_code=400, detail="Bill is already paid")
    assert_year_writable(db, bill.academic_year_id)

    if payment_mode not in ("cash", "UPI", "bank"):
        raise HTTPException(status_code=400, detail="payment_mode must be cash, UPI, or bank")

    base = Decimal(bill.amount)
    late = Decimal(bill.late_fee_amount or 0)
    expected = base + late
    receipt = (receipt_no or "").strip() or next_receipt_no(db, payment_date)
    payment = Payment(
        id=new_id(),
        bill_id=bill.id,
        payment_date=payment_date,
        amount=expected,
        base_amount=base,
        late_fee_amount=late,
        payment_mode=payment_mode,
        receipt_no=receipt,
        remarks=remarks or "",
        created_by=created_by,
    )
    bill.status = "Paid"
    # Keep late_fee_amount on bill for audit trail (FR-10.4); do not zero it.
    db.add(payment)
    db.commit()
    db.refresh(payment)
    db.refresh(bill)
    return {"payment": payment, "bill": bill}


def pay_tuition_bills_bulk(
    db: Session,
    *,
    student_id: str,
    academic_year_id: str,
    bill_ids: list[str],
    payment_date: date,
    payment_mode: str,
    receipt_no: str | None,
    remarks: str | None,
    created_by: str | None,
) -> dict:
    if not bill_ids:
        raise HTTPException(status_code=400, detail="No months/bills selected to pay")
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    assert_year_writable(db, academic_year_id)

    if payment_mode not in ("cash", "UPI", "bank"):
        raise HTTPException(status_code=400, detail="payment_mode must be cash, UPI, or bank")

    bills = (
        db.query(MonthlyBill)
        .filter(
            MonthlyBill.id.in_(bill_ids),
            MonthlyBill.student_id == student_id,
            MonthlyBill.academic_year_id == academic_year_id,
        )
        .all()
    )
    if not bills:
        raise HTTPException(status_code=404, detail="No matching bills found")

    receipt = (receipt_no or "").strip() or next_receipt_no(db, payment_date)
    created_payments = []
    total_amount = Decimal("0")

    for bill in bills:
        if bill.status == "Paid":
            continue
        base = Decimal(bill.amount)
        late = Decimal(bill.late_fee_amount or 0)
        amt = base + late
        bill.status = "Paid"
        # Keep late_fee_amount on bill for audit; payment records split
        p = Payment(
            id=new_id(),
            bill_id=bill.id,
            payment_date=payment_date,
            amount=amt,
            base_amount=base,
            late_fee_amount=late,
            payment_mode=payment_mode,
            receipt_no=receipt,
            remarks=remarks or "",
            created_by=created_by,
        )
        db.add(p)
        created_payments.append(p)
        total_amount += amt

    if not created_payments:
        raise HTTPException(status_code=400, detail="Selected bills are already paid")

    db.commit()
    for p in created_payments:
        db.refresh(p)
    for b in bills:
        db.refresh(b)

    return {
        "payments": created_payments,
        "payment": created_payments[0],  # Primary payment for receipt ID referencing
        "bills": bills,
        "receipt_no": receipt,
        "total_amount": float(total_amount),
        "student": student,
    }
