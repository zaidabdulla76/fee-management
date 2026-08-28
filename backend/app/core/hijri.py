from datetime import date, timedelta

# Billing-period labels (FR-3). Astronomical Hijri conversion is out of scope (§7);
# each period is modeled as 30 Gregorian days from Shawwal start_date.
HIJRI_MONTHS = [
    (1, "Shawwal"),
    (2, "Dhul-Qadah"),
    (3, "Dhul-Hijjah"),
    (4, "Muharram"),
    (5, "Safar"),
    (6, "Rabi' al-Awwal"),
    (7, "Rabi' al-Thani"),
    (8, "Jumada al-Ula"),
    (9, "Jumada al-Akhirah"),
    (10, "Rajab"),
    (11, "Sha'ban"),
    (12, "Ramadan"),
]

DAYS_PER_HIJRI_MONTH = 30
MONTHS_PER_YEAR = 12
YEAR_LENGTH_DAYS = DAYS_PER_HIJRI_MONTH * MONTHS_PER_YEAR  # 360

SHAWWAL = "Shawwal"
RAMADAN = "Ramadan"


def due_date_for_month(start_date: date, sequence: int) -> date:
    """Gregorian due date for Hijri billing month `sequence` (1=Shawwal … 12=Ramadan)."""
    if sequence < 1 or sequence > MONTHS_PER_YEAR:
        raise ValueError("Hijri month sequence must be 1–12")
    return start_date + timedelta(days=(sequence - 1) * DAYS_PER_HIJRI_MONTH)


def ramadan_end_date(shawwal_start: date) -> date:
    """Last day of the Ramadan billing period for a year that starts on Shawwal."""
    # Ramadan starts at month 12; lasts DAYS_PER_HIJRI_MONTH days → ends day before next Shawwal.
    return shawwal_start + timedelta(days=YEAR_LENGTH_DAYS - 1)


def next_shawwal_start(previous_shawwal_start: date) -> date:
    """FR-3.4: next academic year starts at Shawwal, immediately after prior Ramadan."""
    return previous_shawwal_start + timedelta(days=YEAR_LENGTH_DAYS)


def today() -> date:
    return date.today()
