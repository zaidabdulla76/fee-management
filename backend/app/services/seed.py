from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.hijri import HIJRI_MONTHS
from app.core.security import hash_password
from app.models.entities import (
    ClassGrade,
    FeeItem,
    FeeType,
    HijriMonth,
    LateFeeSetting,
    MetaCounter,
    User,
    new_id,
)


def seed_if_empty(db: Session) -> None:
    if db.query(User).first():
        return

    db.add(
        User(
            id=new_id(),
            username="admin",
            password_hash=hash_password("admin123"),
            role="admin",
        )
    )

    for seq, name in HIJRI_MONTHS:
        db.add(HijriMonth(id=new_id(), month_name=name, sequence=seq))

    tuition = FeeType(id=new_id(), name="Tuition", description="Monthly tuition fee", mode="tuition")
    admission = FeeType(id=new_id(), name="Admission", description="Initial admission fee", mode="admission")
    books = FeeType(id=new_id(), name="Books", description="Course / book collection", mode="collection")
    exam = FeeType(id=new_id(), name="Exam", description="Exam fee", mode="collection")
    uniform = FeeType(id=new_id(), name="Uniform", description="Uniform by size", mode="collection")
    bag = FeeType(id=new_id(), name="Bag", description="School bag", mode="collection")
    for ft in (tuition, admission, books, exam, uniform, bag):
        db.add(ft)
    db.flush()
    db.add(FeeItem(id=new_id(), fee_type_id=admission.id, label="Admission Fee", price=Decimal("1000")))

    db.add(FeeItem(id=new_id(), fee_type_id=books.id, label="Course 5 – Mathematics", price=Decimal("450")))
    db.add(FeeItem(id=new_id(), fee_type_id=books.id, label="Course 5 – English", price=Decimal("400")))
    db.add(FeeItem(id=new_id(), fee_type_id=books.id, label="Course 6 – Science", price=Decimal("500")))
    db.add(FeeItem(id=new_id(), fee_type_id=exam.id, label="Standard", price=Decimal("300")))
    db.add(FeeItem(id=new_id(), fee_type_id=bag.id, label="Standard", price=Decimal("650")))
    for i, size in enumerate(["S", "M", "L", "XL", "XXL"]):
        db.add(
            FeeItem(
                id=new_id(),
                fee_type_id=uniform.id,
                label=f"Size {size}",
                price=Decimal(800 + i * 50),
            )
        )

    for n in range(1, 11):
        db.add(ClassGrade(id=new_id(), name=str(n), active=True))

    db.add(
        LateFeeSetting(
            id=new_id(),
            grace_period_days=7,
            late_fee_type="Flat",
            late_fee_value=Decimal("100"),
        )
    )
    db.add(MetaCounter(id=new_id(), key="student_seq", value=0))
    db.commit()
