#!/usr/bin/env python3
"""
Test script to validate statement parser against sample PDFs
"""

import sys
from pathlib import Path
from statement_parser import StatementParser, parse_all_statements
import json


def print_statement_summary(statement):
    """Pretty-print a parsed statement"""
    print(f"\n{'='*70}")
    print(f"Statement Reference: {statement.statement_reference}")
    print(f"Statement Date: {statement.statement_date.strftime('%d %B %Y') if statement.statement_date else 'N/A'}")
    print(f"Property: {statement.property_address}")
    print(f"Landlord: {statement.landlord_name}")
    print(f"Document Type: {statement.doc_type}")

    print(f"\nPeriod: {statement.period_start.strftime('%d/%m/%Y') if statement.period_start else 'N/A'} to "
          f"{statement.period_end.strftime('%d/%m/%Y') if statement.period_end else 'N/A'}")

    if statement.paid_date:
        print(f"Paid on: {statement.paid_date.strftime('%d/%m/%Y')}")

    print(f"\n--- FINANCIAL SUMMARY ---")
    print(f"Rooms found: {len(statement.rooms)}")
    print(f"  Room numbers: {[r.room_number for r in statement.rooms]}")

    print(f"\nGross Rent:           £{statement.gross_rent:>10.2f}")
    print(f"Management Fees:      £{statement.total_management_fees:>10.2f}")
    if statement.total_property_charges > 0:
        print(f"Property Charges:     £{statement.total_property_charges:>10.2f}")
    if statement.total_letting_fees > 0:
        print(f"Letting Fees:         £{statement.total_letting_fees:>10.2f}")
    print(f"                       {'─'*15}")
    print(f"Net to Landlord:      £{statement.net_to_landlord:>10.2f}")

    if statement.property_charges:
        print(f"\n--- PROPERTY CHARGES ({len(statement.property_charges)} items) ---")
        for charge in statement.property_charges:
            print(f"  • {charge.description}: £{charge.amount:.2f}")

    if statement.rooms:
        print(f"\n--- ROOM BREAKDOWN ---")
        for room in statement.rooms:
            print(f"\nRoom {room.room_number}: {room.tenant_name}")
            for rent in room.rents:
                start = rent['start'].strftime('%d/%m/%Y')
                end = rent['end'].strftime('%d/%m/%Y')
                print(f"  Rent ({start} - {end}): £{rent['amount']:.2f}")
            for fee in room.management_fees:
                start = fee['start'].strftime('%d/%m/%Y')
                end = fee['end'].strftime('%d/%m/%Y')
                print(f"  Fee ({start} - {end}):  £{fee['amount']:.2f}")
            for lf in room.letting_fees:
                print(f"  Letting Fee: £{lf['amount']:.2f}")
            print(f"  → Net: £{room.room_net:.2f}")

    if statement.errors:
        print(f"\n⚠️ ERRORS/WARNINGS ({len(statement.errors)}):")
        for error in statement.errors:
            print(f"  • {error}")
    else:
        print(f"\n✓ No validation errors")

    print(f"{'='*70}")


def test_single_pdf(pdf_path):
    """Test parsing a single PDF"""
    print(f"\nTesting: {pdf_path.name}")
    parser = StatementParser()
    statement = parser.parse_file(str(pdf_path))

    print_statement_summary(statement)

    return statement


def test_directory(pdf_dir):
    """Test parsing all PDFs in a directory"""
    pdf_dir = Path(pdf_dir)

    if not pdf_dir.exists():
        print(f"❌ Directory not found: {pdf_dir}")
        return

    pdf_files = sorted(pdf_dir.glob('Statement LS*.pdf'))

    if not pdf_files:
        print(f"⚠️ No PDFs found matching 'Statement LS*.pdf' in {pdf_dir}")
        print(f"Files in directory:")
        for f in pdf_dir.iterdir():
            print(f"  - {f.name}")
        return

    print(f"Found {len(pdf_files)} PDF files to test")

    statements = []
    success_count = 0
    error_count = 0

    for pdf_file in pdf_files:
        statement = test_single_pdf(pdf_file)
        statements.append(statement)

        if statement.is_valid() and not statement.errors:
            success_count += 1
        else:
            error_count += 1

    # Summary report
    print(f"\n\n{'='*70}")
    print(f"TEST SUMMARY")
    print(f"{'='*70}")
    print(f"Total PDFs tested:  {len(pdf_files)}")
    print(f"Successfully parsed: {success_count}")
    print(f"With errors:        {error_count}")

    # Financial summary across all statements
    total_gross = sum(s.gross_rent for s in statements)
    total_mgmt = sum(s.total_management_fees for s in statements)
    total_charges = sum(s.total_property_charges for s in statements)
    total_net = sum(s.net_to_landlord for s in statements)

    print(f"\n--- AGGREGATE ACROSS ALL STATEMENTS ---")
    print(f"Total Gross Rent:     £{total_gross:>10.2f}")
    print(f"Total Mgmt Fees:      £{total_mgmt:>10.2f}")
    print(f"Total Property Charges: £{total_charges:>10.2f}")
    print(f"Total Net to Landlord: £{total_net:>10.2f}")

    # Validation checks
    print(f"\n--- VALIDATION CHECKS ---")

    # Check 1: Net = Gross - Fees - Charges
    expected_net = total_gross - total_mgmt - total_charges
    check1 = abs(expected_net - total_net) < 0.01
    print(f"{'✓' if check1 else '✗'} Net calculation: {expected_net:.2f} vs {total_net:.2f}")

    # Check 2: Management fees are roughly 12% of gross
    expected_mgmt_pct = total_gross * 0.12
    mgmt_pct_diff = abs(expected_mgmt_pct - total_mgmt)
    check2 = mgmt_pct_diff < total_gross * 0.01  # Within 1%
    print(f"{'✓' if check2 else '✗'} Management fees ~12%: {total_mgmt:.2f} vs ~{expected_mgmt_pct:.2f}")

    # Check 3: All gross rent positive
    check3 = all(s.gross_rent >= 0 for s in statements)
    print(f"{'✓' if check3 else '✗'} All gross rent >= 0: {check3}")

    # Check 4: No negative net
    check4 = all(s.net_to_landlord >= 0 for s in statements)
    negative_nets = [s.statement_reference for s in statements if s.net_to_landlord < 0]
    if negative_nets:
        print(f"✗ Statements with negative net: {', '.join(negative_nets)}")
    else:
        print(f"✓ All net to landlord >= 0: {check4}")

    print(f"\n{'='*70}")


if __name__ == '__main__':
    # Default to current directory or specify PDF directory as argument
    if len(sys.argv) > 1:
        pdf_dir = sys.argv[1]
    else:
        pdf_dir = Path.cwd()

    test_directory(pdf_dir)
