"""
Capital Rooms Statement PDF Parser

Extracts financial data from Capital Rooms landlord statements with comprehensive validation.
Handles two document types:
  - Type A: Full month with property charges section
  - Type B: Mid-month transition with letting fees
"""

import pdfplumber
import re
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple
from decimal import Decimal


@dataclass
class Room:
    """Parsed room data"""
    room_number: int
    tenant_name: str
    rents: List[Dict] = field(default_factory=list)  # [{'start': date, 'end': date, 'amount': Decimal}]
    management_fees: List[Dict] = field(default_factory=list)  # [{'start': date, 'end': date, 'amount': Decimal}]
    letting_fees: List[Dict] = field(default_factory=list)  # [{'amount': Decimal}]

    @property
    def total_rent(self) -> Decimal:
        return sum(Decimal(str(r['amount'])) for r in self.rents)

    @property
    def total_mgmt_fees(self) -> Decimal:
        return sum(Decimal(str(f['amount'])) for f in self.management_fees)

    @property
    def total_letting_fees(self) -> Decimal:
        return sum(Decimal(str(f['amount'])) for f in self.letting_fees)

    @property
    def room_net(self) -> Decimal:
        return self.total_rent - self.total_mgmt_fees - self.total_letting_fees


@dataclass
class PropertyCharge:
    """Property-level charge/deduction"""
    description: str
    amount: Decimal


@dataclass
class ParsedStatement:
    """Complete parsed statement data"""
    # Header
    landlord_name: str
    landlord_address: str
    statement_reference: str
    statement_date: datetime
    property_address: str

    # Charges
    property_charges: List[PropertyCharge] = field(default_factory=list)

    # Rooms
    rooms: List[Room] = field(default_factory=list)

    # Period dates
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None

    # Payment
    paid_date: Optional[datetime] = None

    # Document type
    doc_type: str = "TYPE_A"  # TYPE_A or TYPE_B

    # Errors for validation
    errors: List[str] = field(default_factory=list)

    @property
    def gross_rent(self) -> Decimal:
        return sum(room.total_rent for room in self.rooms)

    @property
    def total_management_fees(self) -> Decimal:
        return sum(room.total_mgmt_fees for room in self.rooms)

    @property
    def total_letting_fees(self) -> Decimal:
        return sum(room.total_letting_fees for room in self.rooms)

    @property
    def total_property_charges(self) -> Decimal:
        return sum(Decimal(str(c.amount)) for c in self.property_charges)

    @property
    def net_to_landlord(self) -> Decimal:
        return self.gross_rent - self.total_management_fees - self.total_property_charges - self.total_letting_fees

    def is_valid(self) -> bool:
        """Check if statement has no critical errors"""
        if not self.statement_reference or not self.statement_date:
            return False
        if not self.landlord_name or not self.property_address:
            return False
        if len(self.rooms) == 0:
            return False
        return True


class StatementParser:
    """Main parser for Capital Rooms statements"""

    def __init__(self):
        # Regex patterns for extraction
        self.rent_pattern = re.compile(
            r'^Rent\s+(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})\s+£([\d,]+\.\d{2})'
        )
        self.mgmt_fee_pattern = re.compile(
            r'^Management Fee \(12%\)\s+(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})\s+£([\d,]+\.\d{2})'
        )
        self.letting_fee_pattern = re.compile(
            r'^Letting Fee\s+£([\d,]+\.\d{2})$'
        )
        self.room_header_pattern = re.compile(
            r'^Room (\d+), (.+) - (.+)$'
        )
        self.statement_ref_pattern = re.compile(r'Our Ref:([A-Z]+\d+)')

    def parse_file(self, pdf_path: str) -> ParsedStatement:
        """Parse a single PDF statement file"""
        try:
            with pdfplumber.open(pdf_path) as pdf:
                text = '\n'.join(page.extract_text() or '' for page in pdf.pages)
                return self.parse_text(text)
        except Exception as e:
            statement = ParsedStatement(
                landlord_name='',
                landlord_address='',
                statement_reference='',
                statement_date=datetime.now(),
                property_address=''
            )
            statement.errors.append(f"Failed to open PDF: {str(e)}")
            return statement

    def parse_text(self, text: str) -> ParsedStatement:
        """Parse statement from extracted text"""
        lines = text.split('\n')

        statement = ParsedStatement(
            landlord_name='',
            landlord_address='',
            statement_reference='',
            statement_date=datetime.now(),
            property_address=''
        )

        # Phase 1: Extract header metadata
        self._extract_header(lines, statement)

        # Phase 2: Detect document type
        has_property_charges_section = self._has_property_charges_section(lines)
        statement.doc_type = "TYPE_A" if has_property_charges_section else "TYPE_B"

        # Phase 3: Extract property charges if present
        if has_property_charges_section:
            self._extract_property_charges(lines, statement)

        # Phase 4: Extract rooms
        self._extract_rooms(lines, statement)

        # Phase 5: Calculate period dates
        self._calculate_period_dates(statement)

        # Phase 6: Extract paid date
        self._extract_paid_date(lines, statement)

        # Phase 7: Validate
        self._validate_statement(statement)

        return statement

    def _extract_header(self, lines: List[str], statement: ParsedStatement):
        """Extract landlord name, address, statement ref, date, property"""
        for i, line in enumerate(lines):
            # Statement reference (can be anywhere, look for "Our Ref:")
            if 'Our Ref:' in line:
                match = self.statement_ref_pattern.search(line)
                if match:
                    statement.statement_reference = match.group(1)

            # Statement date (look for STATEMENT: prefix)
            if 'STATEMENT:' in line:
                date_str = line.split('STATEMENT:')[-1].strip()
                try:
                    statement.statement_date = datetime.strptime(date_str, '%d %B %Y')
                except ValueError:
                    statement.errors.append(f"Could not parse statement date: {date_str}")

            # Landlord name (first few lines, contains "Ltd")
            if i < 10 and 'Ltd' in line and statement.landlord_name == '':
                # Extract just the company name, not including "Our Ref:"
                landlord = line.split(' Our Ref:')[0].strip() if 'Our Ref:' in line else line.strip()
                statement.landlord_name = landlord

            # Property address (appears in statement, usually start of charges/room section)
            if '71 Alloa Road' in line and statement.property_address == '':
                statement.property_address = line.strip()

    def _has_property_charges_section(self, lines: List[str]) -> bool:
        """Detect if document has a property charges section (Type A)"""
        for i, line in enumerate(lines):
            # Look for property charges subtotal pattern
            if re.match(r'^£0\.00\s+£[\d,]+\.\d{2}\s+£0\.00\s+-£[\d,]+\.\d{2}$', line):
                # Check if this appears before first "Room X" line
                for j in range(i, min(i+50, len(lines))):
                    if re.match(r'^Room \d+,', lines[j]):
                        return True  # Found charges section before rooms
        return False

    def _extract_property_charges(self, lines: List[str], statement: ParsedStatement):
        """Extract property charges section - handles multi-line descriptions"""
        in_charges_section = False
        charges_list = []
        current_charge_desc = ""

        for i, line in enumerate(lines):
            # Start of charges section (look for "71 Alloa Road" followed by charges)
            if '71 Alloa Road' in line and i < 20 and i + 1 < len(lines):
                # Check if next non-empty line has £ (indicating charges)
                for j in range(i+1, min(i+5, len(lines))):
                    if lines[j].strip() and '£' in lines[j]:
                        in_charges_section = True
                        break
                if in_charges_section:
                    continue

            # End of charges section (subtotal line with -£)
            if in_charges_section and re.search(r'-£[\d,]+\.\d{2}$', line) and line.startswith('£'):
                in_charges_section = False
                # Don't break, continue to check for rooms

            # Extract charge items (multi-line descriptions possible)
            if in_charges_section:
                # Look for lines with £ amounts
                if '£' in line and not line.startswith('Description'):
                    # Check if this is a charge line (has £ amount at end)
                    match = re.search(r'£([\d,]+\.\d{2})\s+£[\d,]+\.\d{2}$', line)
                    if match:
                        amount_str = match.group(1).replace(',', '')
                        amount = Decimal(amount_str)
                        # Description is everything before the first £
                        description = line.split('£')[0].strip()

                        if current_charge_desc:
                            description = current_charge_desc + ' ' + description
                            current_charge_desc = ""

                        if description and amount > 0:
                            charges_list.append(PropertyCharge(description, amount))
                    elif not re.match(r'^£\d', line):
                        # Multi-line description
                        current_charge_desc = line.strip()

        statement.property_charges = charges_list

    def _extract_rooms(self, lines: List[str], statement: ParsedStatement):
        """Extract room breakdown sections"""
        current_room = None

        for line in lines:
            # Check for room header
            room_match = self.room_header_pattern.match(line)
            if room_match:
                # Save previous room if exists
                if current_room:
                    statement.rooms.append(current_room)

                # Create new room
                current_room = Room(
                    room_number=int(room_match.group(1)),
                    tenant_name=room_match.group(3)
                )
                continue

            # Extract room data lines
            if current_room:
                # Rent line
                rent_match = self.rent_pattern.match(line)
                if rent_match:
                    current_room.rents.append({
                        'start': self._parse_date(rent_match.group(1)),
                        'end': self._parse_date(rent_match.group(2)),
                        'amount': Decimal(rent_match.group(3).replace(',', ''))
                    })
                    continue

                # Management fee line
                fee_match = self.mgmt_fee_pattern.match(line)
                if fee_match:
                    current_room.management_fees.append({
                        'start': self._parse_date(fee_match.group(1)),
                        'end': self._parse_date(fee_match.group(2)),
                        'amount': Decimal(fee_match.group(3).replace(',', ''))
                    })
                    continue

                # Letting fee line
                letting_match = self.letting_fee_pattern.match(line)
                if letting_match:
                    current_room.letting_fees.append({
                        'amount': Decimal(letting_match.group(1).replace(',', ''))
                    })
                    continue

                # Check if we've moved to next room (empty line or new room header)
                if not line.strip() or self.room_header_pattern.match(line):
                    continue

        # Don't forget the last room
        if current_room and current_room.rents:  # Only add if it has data
            statement.rooms.append(current_room)

    def _calculate_period_dates(self, statement: ParsedStatement):
        """Calculate statement period from rent date ranges"""
        all_dates = []

        for room in statement.rooms:
            for rent in room.rents:
                all_dates.append(rent['start'])
                all_dates.append(rent['end'])

        if all_dates:
            statement.period_start = min(all_dates)
            statement.period_end = max(all_dates)

    def _extract_paid_date(self, lines: List[str], statement: ParsedStatement):
        """Extract payment date from statement"""
        for line in lines:
            if line.startswith('Paid on'):
                date_str = line.replace('Paid on', '').strip()
                try:
                    statement.paid_date = datetime.strptime(date_str, '%d/%m/%Y')
                except ValueError:
                    statement.errors.append(f"Could not parse paid date: {date_str}")

    def _validate_statement(self, statement: ParsedStatement):
        """Comprehensive validation of extracted data"""
        # Basic field validation
        if not statement.statement_reference:
            statement.errors.append("Missing statement reference")

        if not statement.property_address:
            statement.errors.append("Missing property address")

        if len(statement.rooms) == 0:
            statement.errors.append("No rooms extracted")

        # Calculate totals and verify math
        gross = statement.gross_rent
        mgmt = statement.total_management_fees
        charges = statement.total_property_charges
        net = statement.net_to_landlord

        # Verify that fees are ~12% of rent (with tolerance for rounding)
        for room in statement.rooms:
            if room.total_rent > 0:
                expected_fee = room.total_rent * Decimal('0.12')
                actual_fee = room.total_mgmt_fees
                # Allow 1% tolerance for rounding
                if abs(expected_fee - actual_fee) > room.total_rent * Decimal('0.01'):
                    statement.errors.append(
                        f"Room {room.room_number}: Management fee mismatch. "
                        f"Expected ~{expected_fee}, got {actual_fee}"
                    )

        # Basic sanity checks
        if gross < 0 or mgmt < 0 or net < 0:
            statement.errors.append("Negative amounts detected")

        if net > gross:
            statement.errors.append("Net to landlord exceeds gross rent (math error)")

    @staticmethod
    def _parse_date(date_str: str) -> datetime:
        """Parse date string in DD/MM/YYYY format"""
        try:
            return datetime.strptime(date_str, '%d/%m/%Y')
        except ValueError:
            return datetime.now()


def parse_all_statements(pdf_directory: str) -> List[ParsedStatement]:
    """Parse all PDFs in a directory"""
    import os
    from pathlib import Path

    parser = StatementParser()
    statements = []

    pdf_files = sorted(Path(pdf_directory).glob('Statement LS*.pdf'))

    for pdf_file in pdf_files:
        print(f"Parsing {pdf_file.name}...")
        statement = parser.parse_file(str(pdf_file))
        statements.append(statement)

        # Print summary
        if statement.is_valid():
            print(f"  ✓ {statement.statement_reference}: £{statement.net_to_landlord}")
        else:
            print(f"  ✗ {statement.statement_reference}: ERRORS - {', '.join(statement.errors)}")

    return statements
