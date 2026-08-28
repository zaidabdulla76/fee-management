from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_current_user,
    require_internal_token,
    verify_password,
)
from app.models.entities import (
    AcademicYear,
    ClassFee,
    ClassGrade,
    FeeItem,
    FeeType,
    HijriMonth,
    LateFeeSetting,
    MonthlyBill,
    Payment,
    Student,
    User,
    new_id,
)
from app.services.billing import (
    create_academic_year,
    enroll_student,
    generate_tuition_bills,
    get_active_year,
    get_tuition_fee_type,
    next_student_code,
    suggest_next_year_start,
)
from app.services.late_fee import apply_late_fees
from app.services.payments import collect_non_tuition, pay_tuition_bill
from app.services.reports import (
    export_pdf,
    export_xlsx,
    report_collections_by_type,
    report_outstanding,
    report_student_ledger,
    report_tuition_status,
    report_year_summary,
)

router = APIRouter()


# ---------- schemas ----------
class LoginIn(BaseModel):
    username: str
    password: str


class StudentIn(BaseModel):
    name: str
    father_name: Optional[str] = ""
    phone: Optional[str] = ""
    class_name: Optional[str] = Field(None, alias="class")
    admission_date: Optional[date] = None

    class Config:
        populate_by_name = True


class StatusIn(BaseModel):
    status: str


class YearIn(BaseModel):
    year_name: str
    start_date: date


class PayIn(BaseModel):
    payment_date: date
    payment_mode: str
    receipt_no: Optional[str] = None
    remarks: Optional[str] = None


class CollectIn(BaseModel):
    student_id: str
    academic_year_id: str
    fee_type_id: str
    fee_item_id: str
    payment_date: date
    payment_mode: str
    receipt_no: Optional[str] = None
    remarks: Optional[str] = None


class ClassFeeIn(BaseModel):
    academic_year_id: str
    class_name: str
    monthly_amount: float


class FeeItemIn(BaseModel):
    id: Optional[str] = None
    fee_type_id: Optional[str] = None
    label: str
    price: float
    active: Optional[bool] = True


class FeeTypeIn(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    mode: str
    active: Optional[bool] = True


class LateFeeIn(BaseModel):
    grace_period_days: int
    late_fee_type: str
    late_fee_value: float


class ClassIn(BaseModel):
    name: str


def student_dict(s: Student) -> dict:
    return {
        "id": s.id,
        "student_code": s.student_code,
        "name": s.name,
        "father_name": s.father_name,
        "phone": s.phone,
        "class": s.class_name,
        "admission_date": s.admission_date.isoformat() if s.admission_date else None,
        "status": s.status,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def year_dict(y: AcademicYear) -> dict:
    return {
        "id": y.id,
        "year_name": y.year_name,
        "start_month": y.start_month,
        "end_month": y.end_month,
        "start_date": y.start_date.isoformat(),
        "status": y.status,
        "created_at": y.created_at.isoformat() if y.created_at else None,
    }


def bill_dict(b: MonthlyBill) -> dict:
    return {
        "id": b.id,
        "student_id": b.student_id,
        "academic_year_id": b.academic_year_id,
        "month_id": b.month_id,
        "fee_type_id": b.fee_type_id,
        "fee_item_id": b.fee_item_id,
        "amount": float(b.amount),
        "late_fee_amount": float(b.late_fee_amount or 0),
        "status": b.status,
        "due_date": b.due_date.isoformat() if b.due_date else None,
        "total_due": float(Decimal(b.amount) + Decimal(b.late_fee_amount or 0)),
    }


def payment_dict(p: Payment) -> dict:
    return {
        "id": p.id,
        "bill_id": p.bill_id,
        "payment_date": p.payment_date.isoformat(),
        "amount": float(p.amount),
        "base_amount": float(p.base_amount),
        "late_fee_amount": float(p.late_fee_amount or 0),
        "payment_mode": p.payment_mode,
        "receipt_no": p.receipt_no,
        "remarks": p.remarks,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


# ---------- auth ----------
@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token(user)
    return {"token": token, "user": {"id": user.id, "username": user.username, "role": user.role}}


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "username": user.username, "role": user.role}


# ---------- dashboard ----------
@router.get("/dashboard")
def dashboard(
    academicYearId: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    apply_late_fees(db)
    year = db.get(AcademicYear, academicYearId) if academicYearId else get_active_year(db)
    active_students = db.query(Student).filter(Student.status == "Active").count()
    if not year:
        return {
            "activeStudents": active_students,
            "totalCollectedThisYear": 0,
            "tuitionPendingAmount": 0,
            "studentsWithPendingTuition": 0,
            "currentYear": None,
        }
    tuition = get_tuition_fee_type(db)
    bills = db.query(MonthlyBill).filter(MonthlyBill.academic_year_id == year.id).all()
    bill_ids = [b.id for b in bills]
    payments = db.query(Payment).filter(Payment.bill_id.in_(bill_ids or ["__none__"])).all()
    pending = [
        b
        for b in bills
        if b.fee_type_id == tuition.id and b.status in ("Pending", "Overdue")
    ]
    return {
        "activeStudents": active_students,
        "totalCollectedThisYear": float(sum(Decimal(p.amount) for p in payments)),
        "tuitionPendingAmount": float(
            sum(Decimal(b.amount) + Decimal(b.late_fee_amount or 0) for b in pending)
        ),
        "studentsWithPendingTuition": len({b.student_id for b in pending}),
        "currentYear": year_dict(year),
    }


# ---------- students ----------
@router.get("/students")
def list_students(
    q: Optional[str] = None,
    class_name: Optional[str] = Query(None, alias="class"),
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.query(Student)
    if status:
        rows = rows.filter(Student.status == status)
    if class_name:
        rows = rows.filter(Student.class_name == class_name)
    students = rows.order_by(Student.name.asc()).all()
    if q:
        term = q.lower()
        students = [
            s
            for s in students
            if term in (s.name or "").lower()
            or term in (s.phone or "").lower()
            or term in (s.student_code or "").lower()
            or term in (s.class_name or "").lower()
            or term in (s.father_name or "").lower()
        ]
    return [student_dict(s) for s in students]


@router.post("/students", status_code=201)
def create_student(
    body: StudentIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    class_name = body.class_name
    if not class_name:
        raise HTTPException(status_code=400, detail="class is required")
    student = Student(
        id=new_id(),
        student_code=next_student_code(db),
        name=body.name.strip(),
        father_name=(body.father_name or "").strip(),
        phone=(body.phone or "").strip(),
        class_name=class_name,
        admission_date=body.admission_date or date.today(),
        status="Active",
    )
    db.add(student)
    db.flush()
    warning = None
    active = get_active_year(db)
    if active:
        try:
            generate_tuition_bills(db, student, active)
        except HTTPException as exc:
            warning = str(exc.detail)
    db.commit()
    db.refresh(student)
    return {"student": student_dict(student), "warning": warning}


@router.get("/students/{student_id}")
def get_student(student_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    bill_years = (
        db.query(MonthlyBill.academic_year_id)
        .filter(MonthlyBill.student_id == student_id)
        .distinct()
        .all()
    )
    ids = [y[0] for y in bill_years]
    years = db.query(AcademicYear).filter(AcademicYear.id.in_(ids or ["__none__"])).all()
    years.sort(key=lambda y: y.created_at or date.min, reverse=True)
    return {"student": student_dict(student), "years": [year_dict(y) for y in years]}


@router.put("/students/{student_id}")
@router.patch("/students/{student_id}")
def update_student(
    student_id: str,
    body: StudentIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    student.name = body.name.strip()
    student.father_name = (body.father_name or "").strip()
    student.phone = (body.phone or "").strip()
    if body.class_name:
        student.class_name = body.class_name
    if body.admission_date:
        student.admission_date = body.admission_date
    db.commit()
    db.refresh(student)
    return student_dict(student)


@router.patch("/students/{student_id}/status")
def set_status(
    student_id: str,
    body: StatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.status not in ("Active", "Inactive"):
        raise HTTPException(status_code=400, detail="status must be Active or Inactive")
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    student.status = body.status
    db.commit()
    return student_dict(student)


@router.get("/students/{student_id}/years/{year_id}/tuition")
def student_tuition(
    student_id: str,
    year_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    apply_late_fees(db)
    student = db.get(Student, student_id)
    year = db.get(AcademicYear, year_id)
    if not student or not year:
        raise HTTPException(status_code=404, detail="Student or year not found")
    tuition = get_tuition_fee_type(db)
    bills = (
        db.query(MonthlyBill)
        .filter(
            MonthlyBill.student_id == student_id,
            MonthlyBill.academic_year_id == year_id,
            MonthlyBill.fee_type_id == tuition.id,
        )
        .all()
    )
    if not bills and year.status == "Active" and student.status == "Active":
        try:
            bills = generate_tuition_bills(db, student, year)
            db.commit()
        except HTTPException:
            bills = []
    months = db.query(HijriMonth).order_by(HijriMonth.sequence.asc()).all()
    bill_by_month = {b.month_id: b for b in bills}
    return [
        {
            "month": {"id": m.id, "month_name": m.month_name, "sequence": m.sequence},
            "bill": bill_dict(bill_by_month[m.id]) if m.id in bill_by_month else None,
        }
        for m in months
    ]


@router.get("/students/{student_id}/payments")
def student_payments(
    student_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Student, student_id):
        raise HTTPException(status_code=404, detail="Student not found")
    bills = db.query(MonthlyBill).filter(MonthlyBill.student_id == student_id).all()
    bill_map = {b.id: b for b in bills}
    payments = db.query(Payment).filter(Payment.bill_id.in_(list(bill_map.keys()) or ["__none__"])).all()
    types = {t.id: t for t in db.query(FeeType).all()}
    items = {i.id: i for i in db.query(FeeItem).all()}
    months = {m.id: m for m in db.query(HijriMonth).all()}
    years = {y.id: y for y in db.query(AcademicYear).all()}
    rows = []
    for p in sorted(payments, key=lambda x: x.payment_date, reverse=True):
        b = bill_map[p.bill_id]
        rows.append(
            {
                **payment_dict(p),
                "bill": bill_dict(b),
                "fee_type": {"id": b.fee_type_id, "name": types[b.fee_type_id].name}
                if b.fee_type_id in types
                else None,
                "fee_item": {"id": b.fee_item_id, "label": items[b.fee_item_id].label}
                if b.fee_item_id and b.fee_item_id in items
                else None,
                "month": {
                    "id": b.month_id,
                    "month_name": months[b.month_id].month_name,
                }
                if b.month_id and b.month_id in months
                else None,
                "academic_year": year_dict(years[b.academic_year_id])
                if b.academic_year_id in years
                else None,
            }
        )
    return rows


# ---------- academic years + enroll (architecture) ----------
@router.get("/academic-years")
def list_years(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    years = db.query(AcademicYear).order_by(AcademicYear.created_at.desc()).all()
    return [year_dict(y) for y in years]


@router.get("/academic-years/next-start")
def next_year_start(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """FR-3.4: suggested Shawwal start immediately after prior Ramadan."""
    return suggest_next_year_start(db)


@router.post("/academic-years", status_code=201)
def post_year(body: YearIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    result = create_academic_year(db, body.year_name, body.start_date)
    return {"year": year_dict(result["year"]), "warning": result["warning"]}


@router.get("/academic-years/{year_id}")
def get_year(year_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    year = db.get(AcademicYear, year_id)
    if not year:
        raise HTTPException(status_code=404, detail="Academic year not found")
    return year_dict(year)


@router.post("/academic-years/{year_id}/enroll")
def enroll(
    year_id: str,
    student_id: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return enroll_student(db, student_id, year_id)


# ---------- billing / collections ----------
@router.post("/bills/{bill_id}/pay", status_code=201)
def pay_bill(
    bill_id: str,
    body: PayIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = pay_tuition_bill(
        db,
        bill_id=bill_id,
        payment_date=body.payment_date,
        payment_mode=body.payment_mode,
        receipt_no=body.receipt_no,
        remarks=body.remarks,
        created_by=user.id,
    )
    return {"payment": payment_dict(result["payment"]), "bill": bill_dict(result["bill"])}


@router.post("/collections", status_code=201)
def collections(
    body: CollectIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = collect_non_tuition(
        db,
        student_id=body.student_id,
        academic_year_id=body.academic_year_id,
        fee_type_id=body.fee_type_id,
        fee_item_id=body.fee_item_id,
        payment_date=body.payment_date,
        payment_mode=body.payment_mode,
        receipt_no=body.receipt_no,
        remarks=body.remarks,
        created_by=user.id,
    )
    return {
        "bill": bill_dict(result["bill"]),
        "payment": payment_dict(result["payment"]),
        "fee_type": {
            "id": result["fee_type"].id,
            "name": result["fee_type"].name,
            "mode": result["fee_type"].mode,
        },
        "fee_item": {
            "id": result["fee_item"].id,
            "label": result["fee_item"].label,
            "price": float(result["fee_item"].price),
        },
        "student": student_dict(result["student"]),
    }


@router.get("/fee-types")
def list_fee_types(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "mode": t.mode,
            "active": t.active,
        }
        for t in db.query(FeeType).all()
    ]


def _fee_items_payload(db: Session, tid: Optional[str]):
    q = db.query(FeeItem).filter(FeeItem.active.is_(True))
    if tid:
        q = q.filter(FeeItem.fee_type_id == tid)
    return [
        {
            "id": i.id,
            "fee_type_id": i.fee_type_id,
            "label": i.label,
            "price": float(i.price),
            "active": i.active,
        }
        for i in q.all()
    ]


@router.get("/fee-types/{fee_type_id}/items")
def list_fee_type_items(
    fee_type_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _fee_items_payload(db, fee_type_id)


@router.get("/fee-items")
def list_fee_items(
    feeTypeId: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _fee_items_payload(db, feeTypeId)


# ---------- settings ----------
@router.get("/settings/fee-types")
def settings_fee_types(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return list_fee_types(db, user)


@router.post("/settings/fee-types", status_code=201)
def create_fee_type(body: FeeTypeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if body.mode not in ("enrollment", "collection"):
        raise HTTPException(status_code=400, detail="mode must be enrollment or collection")
    row = FeeType(
        id=new_id(),
        name=body.name.strip(),
        description=body.description or "",
        mode=body.mode,
        active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "description": row.description, "mode": row.mode, "active": row.active}


@router.put("/settings/fee-types/{item_id}")
def update_fee_type(
    item_id: str,
    body: FeeTypeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(FeeType, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fee type not found")
    row.name = body.name
    row.description = body.description or ""
    row.mode = body.mode
    row.active = body.active if body.active is not None else row.active
    db.commit()
    return {"id": row.id, "name": row.name, "description": row.description, "mode": row.mode, "active": row.active}


@router.patch("/settings/fee-types/{item_id}/retire")
def retire_fee_type(item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(FeeType, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fee type not found")
    row.active = False
    db.commit()
    return {"id": row.id, "active": False}


@router.get("/settings/classes")
def list_classes(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [
        {"id": c.id, "name": c.name, "active": c.active}
        for c in db.query(ClassGrade).filter(ClassGrade.active.is_(True)).all()
    ]


@router.post("/settings/classes", status_code=201)
def add_class(body: ClassIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    existing = db.query(ClassGrade).filter(ClassGrade.name == body.name.strip()).first()
    if existing:
        existing.active = True
        db.commit()
        return {"id": existing.id, "name": existing.name, "active": True}
    row = ClassGrade(id=new_id(), name=body.name.strip(), active=True)
    db.add(row)
    db.commit()
    return {"id": row.id, "name": row.name, "active": True}


@router.patch("/settings/classes/{item_id}/retire")
def retire_class(item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(ClassGrade, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Class not found")
    row.active = False
    db.commit()
    return {"id": row.id, "active": False}


@router.get("/settings/class-fees")
def get_class_fees(
    academicYearId: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(ClassFee)
    if academicYearId:
        q = q.filter(ClassFee.academic_year_id == academicYearId)
    return [
        {
            "id": f.id,
            "academic_year_id": f.academic_year_id,
            "class_name": f.class_name,
            "monthly_amount": float(f.monthly_amount),
        }
        for f in q.all()
    ]


@router.post("/settings/class-fees", status_code=201)
@router.put("/settings/class-fees")
def upsert_class_fee(
    body: ClassFeeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = (
        db.query(ClassFee)
        .filter(
            ClassFee.academic_year_id == body.academic_year_id,
            ClassFee.class_name == body.class_name,
        )
        .first()
    )
    if row:
        row.monthly_amount = Decimal(str(body.monthly_amount))
    else:
        row = ClassFee(
            id=new_id(),
            academic_year_id=body.academic_year_id,
            class_name=body.class_name,
            monthly_amount=Decimal(str(body.monthly_amount)),
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "academic_year_id": row.academic_year_id,
        "class_name": row.class_name,
        "monthly_amount": float(row.monthly_amount),
    }


@router.get("/settings/fee-items")
def settings_fee_items(
    feeTypeId: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(FeeItem)
    if feeTypeId:
        q = q.filter(FeeItem.fee_type_id == feeTypeId)
    return [
        {
            "id": i.id,
            "fee_type_id": i.fee_type_id,
            "label": i.label,
            "price": float(i.price),
            "active": i.active,
        }
        for i in q.all()
    ]


@router.post("/settings/fee-items", status_code=201)
def create_fee_item(body: FeeItemIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not body.fee_type_id:
        raise HTTPException(status_code=400, detail="fee_type_id is required")
    row = FeeItem(
        id=new_id(),
        fee_type_id=body.fee_type_id,
        label=body.label.strip(),
        price=Decimal(str(body.price)),
        active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "fee_type_id": row.fee_type_id,
        "label": row.label,
        "price": float(row.price),
        "active": row.active,
    }


@router.put("/settings/fee-items/{item_id}")
@router.patch("/settings/fee-items/{item_id}")
def update_fee_item(
    item_id: str,
    body: FeeItemIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(FeeItem, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fee item not found")
    row.label = body.label
    row.price = Decimal(str(body.price))
    if body.active is not None:
        row.active = body.active
    db.commit()
    return {
        "id": row.id,
        "fee_type_id": row.fee_type_id,
        "label": row.label,
        "price": float(row.price),
        "active": row.active,
    }


@router.patch("/settings/fee-items/{item_id}/retire")
def retire_fee_item(item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(FeeItem, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fee item not found")
    row.active = False
    db.commit()
    return {"id": row.id, "active": False}


@router.get("/settings/late-fee")
def get_late_fee(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.query(LateFeeSetting).first()
    if not row:
        return None
    return {
        "id": row.id,
        "grace_period_days": row.grace_period_days,
        "late_fee_type": row.late_fee_type,
        "late_fee_value": float(row.late_fee_value),
    }


@router.put("/settings/late-fee")
@router.post("/settings/late-fee")
def put_late_fee(body: LateFeeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if body.late_fee_type not in ("Flat", "Percent"):
        raise HTTPException(status_code=400, detail="late_fee_type must be Flat or Percent")
    row = db.query(LateFeeSetting).first()
    if not row:
        row = LateFeeSetting(id=new_id())
        db.add(row)
    row.grace_period_days = body.grace_period_days
    row.late_fee_type = body.late_fee_type
    row.late_fee_value = Decimal(str(body.late_fee_value))
    db.commit()
    return {
        "id": row.id,
        "grace_period_days": row.grace_period_days,
        "late_fee_type": row.late_fee_type,
        "late_fee_value": float(row.late_fee_value),
    }


# ---------- reports (architecture-aligned + extended) ----------
@router.get("/reports/collections-by-type")
@router.get("/reports/collected")
def api_collections(
    academicYearId: str,
    format: str = "json",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = report_collections_by_type(db, academicYearId)
    return _maybe_export("collections-by-type", data, format)


@router.get("/reports/outstanding-tuition")
def api_outstanding(
    academicYearId: str,
    format: str = "json",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = report_outstanding(db, academicYearId)
    return _maybe_export("outstanding-tuition", data, format)


@router.get("/reports/year-summary")
def api_year_summary(
    academicYearId: str,
    format: str = "json",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = report_year_summary(db, academicYearId)
    return _maybe_export("year-summary", data, format)


@router.get("/reports/tuition-status")
def api_tuition_status(
    academicYearId: str,
    format: str = "json",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = report_tuition_status(db, academicYearId)
    return _maybe_export("tuition-status", data, format)


@router.get("/reports/student-ledger/{student_id}")
@router.get("/reports/ledger")
def api_ledger(
    student_id: Optional[str] = None,
    studentId: Optional[str] = None,
    format: str = "json",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sid = student_id or studentId
    if not sid:
        raise HTTPException(status_code=400, detail="studentId is required")
    data = report_student_ledger(db, sid)
    return _maybe_export("student-ledger", data, format)


@router.get("/reports/export")
def reports_export(
    kind: str = Query("year-summary"),
    academicYearId: Optional[str] = None,
    studentId: Optional[str] = None,
    format: str = Query("pdf"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if kind == "collected" or kind == "collections-by-type":
        data = report_collections_by_type(db, academicYearId)
        kind = "collections-by-type"
    elif kind == "outstanding-tuition":
        data = report_outstanding(db, academicYearId)
    elif kind == "ledger" or kind == "student-ledger":
        data = report_student_ledger(db, studentId)
        kind = "student-ledger"
    elif kind == "tuition-status":
        data = report_tuition_status(db, academicYearId)
    else:
        data = report_year_summary(db, academicYearId)
        kind = "year-summary"
    return _maybe_export(kind, data, format)


def _maybe_export(kind: str, data: dict, fmt: str):
    fmt = (fmt or "json").lower()
    if fmt == "json":
        return data
    title = kind
    headers = ["col"]
    rows = []
    lines = []
    if kind == "tuition-status":
        headers = ["Code", "Name", "Class", "Paid", "Pending", "Status", "Outstanding"]
        rows = [
            [
                r["student"]["student_code"],
                r["student"]["name"],
                r["student"]["class"],
                r["paid_months"],
                r["pending_months"],
                r["status"],
                r["outstanding"],
            ]
            for r in data["rows"]
        ]
        lines = [f"{' | '.join(map(str, r))}" for r in rows]
        title = f"Tuition Status — {data['year']['year_name']}"
    elif kind == "collections-by-type":
        headers = ["Fee Type", "Fee Item", "Count", "Total"]
        rows = []
        for r in data["rows"]:
            rows.append([r["fee_type"], "(all)", r["count"], r["total"]])
            for item in r.get("items") or []:
                rows.append([r["fee_type"], item["label"], item["count"], item["total"]])
        lines = [f"{' | '.join(map(str, r))}" for r in rows]
        title = f"Collections — {data['year']['year_name']}"
    elif kind == "outstanding-tuition":
        headers = ["Code", "Name", "Month", "Status", "Total"]
        rows = [
            [
                r["student"]["student_code"],
                r["student"]["name"],
                r["month"]["month_name"] if r["month"] else "",
                r["bill"]["status"],
                r["total_due"],
            ]
            for r in data["rows"]
        ]
        lines = [f"{' | '.join(map(str, r))}" for r in rows]
        title = f"Outstanding — {data['year']['year_name']}"
    elif kind == "student-ledger":
        headers = ["Date", "Year", "Fee Type", "Detail", "Status", "Amount"]
        rows = [
            [
                r.get("date"),
                r.get("academic_year"),
                r.get("fee_type"),
                r.get("month") or r.get("fee_item") or "",
                r.get("status"),
                r.get("amount"),
            ]
            for r in data["rows"]
        ]
        lines = [f"{' | '.join(map(str, r))}" for r in rows]
        title = f"Ledger — {data['student']['name']}"
    else:
        headers = ["Metric", "Value"]
        rows = [
            ["Students with tuition", data.get("active_students_with_tuition")],
            ["Fully paid", data.get("fully_paid_students")],
            ["With dues", data.get("students_with_dues")],
            ["Total collected", data.get("total_collected")],
            ["Late fees", data.get("late_fees_collected")],
            ["Outstanding", data.get("outstanding_amount")],
        ]
        lines = [f"{a}: {b}" for a, b in rows]
        title = f"Year Summary — {data['year']['year_name']}"

    if fmt in ("xlsx", "excel"):
        content = export_xlsx(title, headers, rows)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{kind}.xlsx"'},
        )
    content = export_pdf(title, lines)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{kind}.pdf"'},
    )


@router.get("/payments/{payment_id}/receipt.pdf")
def receipt_pdf(payment_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    payment = db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    bill = db.get(MonthlyBill, payment.bill_id)
    student = db.get(Student, bill.student_id) if bill else None
    year = db.get(AcademicYear, bill.academic_year_id) if bill else None
    fee_type = db.get(FeeType, bill.fee_type_id) if bill else None
    fee_item = db.get(FeeItem, bill.fee_item_id) if bill and bill.fee_item_id else None
    month = db.get(HijriMonth, bill.month_id) if bill and bill.month_id else None
    lines = [
        f"Receipt No: {payment.receipt_no}",
        f"Date: {payment.payment_date.isoformat()}",
        f"Mode: {payment.payment_mode}",
        f"Student: {student.name if student else '-'} ({student.student_code if student else '-'})",
        f"Class: {student.class_name if student else '-'}",
        f"Academic Year: {year.year_name if year else '-'}",
        f"Fee Type: {fee_type.name if fee_type else '-'}",
        f"Month: {month.month_name if month else '-'}",
        f"Item: {fee_item.label if fee_item else '-'}",
        f"Base: ₹{float(payment.base_amount):.2f}",
        f"Late Fee: ₹{float(payment.late_fee_amount or 0):.2f}",
        f"Total Paid: ₹{float(payment.amount):.2f}",
        f"Remarks: {payment.remarks or ''}",
    ]
    content = export_pdf("Fee Payment Receipt", lines)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{payment.receipt_no}.pdf"'},
    )


# ---------- internal scheduler endpoint ----------
@router.post("/internal/late-fee-sweep")
def late_fee_sweep(
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_token),
):
    return apply_late_fees(db)
