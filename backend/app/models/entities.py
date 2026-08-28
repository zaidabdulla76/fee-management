from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    String,
    Text,
    Integer,
    Numeric,
    Date,
    DateTime,
    Boolean,
    ForeignKey,
    Index,
    CheckConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_id() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(40), default="admin")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Student(Base):
    __tablename__ = "students"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    student_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    father_name: Mapped[Optional[str]] = mapped_column(String(200), default="")
    phone: Mapped[Optional[str]] = mapped_column(String(40), default="")
    class_name: Mapped[str] = mapped_column("class", String(40), nullable=False)
    admission_date: Mapped[Optional[date]] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="Active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AcademicYear(Base):
    __tablename__ = "academic_years"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    year_name: Mapped[str] = mapped_column(String(80), nullable=False)
    start_month: Mapped[str] = mapped_column(String(40), default="Shawwal")
    end_month: Mapped[str] = mapped_column(String(40), default="Ramadan")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="Active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class HijriMonth(Base):
    __tablename__ = "hijri_months"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    month_name: Mapped[str] = mapped_column(String(80), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)


class FeeType(Base):
    __tablename__ = "fee_types"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, default="")
    mode: Mapped[str] = mapped_column(String(20), nullable=False)  # enrollment | collection
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class ClassGrade(Base):
    __tablename__ = "classes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class ClassFee(Base):
    __tablename__ = "class_fees"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    academic_year_id: Mapped[str] = mapped_column(ForeignKey("academic_years.id"), nullable=False)
    class_name: Mapped[str] = mapped_column(String(40), nullable=False)
    monthly_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)


class FeeItem(Base):
    __tablename__ = "fee_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    fee_type_id: Mapped[str] = mapped_column(ForeignKey("fee_types.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class LateFeeSetting(Base):
    __tablename__ = "late_fee_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    grace_period_days: Mapped[int] = mapped_column(Integer, default=7)
    late_fee_type: Mapped[str] = mapped_column(String(20), default="Flat")  # Flat | Percent
    late_fee_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("100"))


class MonthlyBill(Base):
    __tablename__ = "monthly_bills"
    __table_args__ = (
        Index("ix_bills_student_year", "student_id", "academic_year_id"),
        Index("ix_bills_status_due", "status", "due_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), nullable=False)
    academic_year_id: Mapped[str] = mapped_column(ForeignKey("academic_years.id"), nullable=False)
    month_id: Mapped[Optional[str]] = mapped_column(ForeignKey("hijri_months.id"), nullable=True)
    fee_type_id: Mapped[str] = mapped_column(ForeignKey("fee_types.id"), nullable=False)
    fee_item_id: Mapped[Optional[str]] = mapped_column(ForeignKey("fee_items.id"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    late_fee_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(20), default="Pending")  # Pending|Paid|Overdue
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    bill_id: Mapped[str] = mapped_column(ForeignKey("monthly_bills.id"), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    base_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    late_fee_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    payment_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    receipt_no: Mapped[str] = mapped_column(String(40), nullable=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text, default="")
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MetaCounter(Base):
    __tablename__ = "meta_counters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    value: Mapped[int] = mapped_column(Integer, default=0)
