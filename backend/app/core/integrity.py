"""NFR-1 / FR-4.3 integrity: payments are append-only; bill identity is immutable."""
from __future__ import annotations

from sqlalchemy import event, inspect

from app.models.entities import MonthlyBill, Payment

# Bill fields that may change after insert (late-fee sweep + mark Paid).
_BILL_MUTABLE = frozenset({"status", "late_fee_amount"})


class IntegrityError(Exception):
    """Raised when an append-only / immutable rule is violated."""


@event.listens_for(Payment, "before_update")
def _payment_no_update(mapper, connection, target: Payment) -> None:  # noqa: ARG001
    raise IntegrityError(
        "Payments are append-only (NFR-1): existing payment rows cannot be updated"
    )


@event.listens_for(Payment, "before_delete")
def _payment_no_delete(mapper, connection, target: Payment) -> None:  # noqa: ARG001
    raise IntegrityError(
        "Payments are append-only (NFR-1): payment rows cannot be deleted"
    )


@event.listens_for(MonthlyBill, "before_update")
def _bill_identity_immutable(mapper, connection, target: MonthlyBill) -> None:  # noqa: ARG001
    state = inspect(target)
    for attr in state.mapper.column_attrs:
        key = attr.key
        if key in _BILL_MUTABLE or key == "id":
            continue
        hist = state.get_history(key, True)
        if hist.has_changes():
            raise IntegrityError(
                f"Bill field '{key}' is immutable after creation (FR-4.3); "
                "only status and late_fee_amount may change"
            )
