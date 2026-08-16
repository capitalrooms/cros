"""
Database integration for parsed statements
Handles insertion into Supabase with proper validation and error handling
"""

from typing import Optional, Dict, Tuple
from datetime import datetime
from decimal import Decimal
import os
import json
from statement_parser import ParsedStatement, Room
import uuid


class StatementDatabaseIntegration:
    """Manages database operations for parsed statements"""

    def __init__(self, supabase_url: str, supabase_key: str):
        """Initialize with Supabase credentials"""
        try:
            from supabase import create_client
            self.supabase = create_client(supabase_url, supabase_key)
        except ImportError:
            raise ImportError("supabase-py not installed. Run: pip install supabase")

    def find_property_by_address(self, address: str) -> Optional[str]:
        """
        Find property ID by address matching
        Returns UUID if found, None if not found
        """
        try:
            response = self.supabase.table('properties').select('id').ilike(
                'address', f'%{address}%'
            ).execute()

            if response.data and len(response.data) == 1:
                return response.data[0]['id']
            elif response.data and len(response.data) > 1:
                # Multiple matches - return error
                raise ValueError(f"Multiple properties match address '{address}'")
            else:
                return None
        except Exception as e:
            print(f"Error finding property: {e}")
            return None

    def find_landlord_by_name(self, name: str) -> Optional[str]:
        """
        Find landlord ID by name matching
        Returns UUID if found, None if not found
        """
        try:
            response = self.supabase.table('people').select('id').ilike(
                'name', f'%{name}%'
            ).execute()

            if response.data and len(response.data) == 1:
                return response.data[0]['id']
            elif response.data and len(response.data) > 1:
                # Multiple matches - return error
                raise ValueError(f"Multiple people match name '{name}'")
            else:
                return None
        except Exception as e:
            print(f"Error finding landlord: {e}")
            return None

    def check_statement_exists(self, landlord_id: str, property_id: str, reference: str) -> bool:
        """Check if statement already exists (duplicate prevention)"""
        try:
            response = self.supabase.table('landlord_statements').select('id').match({
                'landlord_id': landlord_id,
                'property_id': property_id,
                'statement_reference': reference
            }).execute()

            return len(response.data) > 0
        except Exception as e:
            print(f"Error checking statement: {e}")
            return False

    def insert_statement(self, statement: ParsedStatement) -> Tuple[bool, Optional[str], str]:
        """
        Insert a parsed statement and all related data
        Returns: (success, statement_id, message)
        """
        # Validation
        if not statement.is_valid():
            return False, None, f"Statement validation failed: {', '.join(statement.errors)}"

        # Find property
        property_id = self.find_property_by_address(statement.property_address)
        if not property_id:
            return False, None, f"Property not found: {statement.property_address}"

        # Find landlord
        landlord_id = self.find_landlord_by_name(statement.landlord_name)
        if not landlord_id:
            return False, None, f"Landlord not found: {statement.landlord_name}"

        # Check for duplicates
        if self.check_statement_exists(landlord_id, property_id, statement.statement_reference):
            return False, None, f"Statement already exists: {statement.statement_reference}"

        # Generate IDs
        statement_id = str(uuid.uuid4())

        try:
            # 1. Insert main statement
            statement_data = {
                'id': statement_id,
                'landlord_id': landlord_id,
                'property_id': property_id,
                'statement_reference': statement.statement_reference,
                'statement_date': statement.statement_date.date().isoformat(),
                'period_start': statement.period_start.date().isoformat() if statement.period_start else None,
                'period_end': statement.period_end.date().isoformat() if statement.period_end else None,
                'gross_rent': float(statement.gross_rent),
                'management_fees': float(statement.total_management_fees),
                'property_charges': float(statement.total_property_charges),
                'net_to_landlord': float(statement.net_to_landlord),
                'amount_paid': float(statement.net_to_landlord),  # Assume full payment
                'paid_date': statement.paid_date.date().isoformat() if statement.paid_date else None,
            }

            self.supabase.table('landlord_statements').insert(statement_data).execute()
            print(f"✓ Inserted statement {statement.statement_reference}")

            # 2. Insert room details
            for room in statement.rooms:
                room_data = {
                    'statement_id': statement_id,
                    'tenant_name': room.tenant_name,
                    'rent_income': float(room.total_rent),
                    'management_fee': float(room.total_mgmt_fees),
                    'net_to_landlord': float(room.room_net),
                }

                self.supabase.table('landlord_statement_rooms').insert(room_data).execute()

            print(f"✓ Inserted {len(statement.rooms)} room entries")

            # 3. Insert property charges
            for charge in statement.property_charges:
                charge_data = {
                    'statement_id': statement_id,
                    'description': charge.description,
                    'category': self._categorize_charge(charge.description),
                    'amount': float(charge.amount),
                }

                self.supabase.table('landlord_statement_charges').insert(charge_data).execute()

            print(f"✓ Inserted {len(statement.property_charges)} charge entries")

            return True, statement_id, f"Successfully imported {statement.statement_reference}"

        except Exception as e:
            return False, None, f"Database insert error: {str(e)}"

    @staticmethod
    def _categorize_charge(description: str) -> str:
        """Categorize a charge description"""
        desc_lower = description.lower()

        if any(word in desc_lower for word in ['netflix', 'spotify', 'amazon', 'subscription']):
            return 'subscriptions'
        elif any(word in desc_lower for word in ['clean', 'cleaning', 'ironing']):
            return 'cleaning'
        elif any(word in desc_lower for word in ['plumb', 'boiler', 'gas', 'water', 'electric', 'heating']):
            return 'maintenance'
        elif any(word in desc_lower for word in ['broadband', 'internet', 'wifi', 'fibre']):
            return 'utilities'
        elif any(word in desc_lower for word in ['garden', 'weed', 'landscape', 'hedge']):
            return 'grounds'
        else:
            return 'other'


class BatchStatementImporter:
    """Batch import multiple statements from directory"""

    def __init__(self, supabase_url: str, supabase_key: str):
        self.db = StatementDatabaseIntegration(supabase_url, supabase_key)
        self.results = {
            'successful': [],
            'failed': [],
            'skipped': []
        }

    def import_all(self, statements: list[ParsedStatement]) -> Dict:
        """Import list of parsed statements"""
        for statement in statements:
            success, stmt_id, message = self.db.insert_statement(statement)

            if success:
                self.results['successful'].append({
                    'reference': statement.statement_reference,
                    'id': stmt_id,
                    'message': message
                })
            else:
                self.results['failed'].append({
                    'reference': statement.statement_reference,
                    'error': message
                })

        return self.results

    def print_summary(self):
        """Print import summary"""
        print(f"\n{'='*70}")
        print("IMPORT SUMMARY")
        print(f"{'='*70}")
        print(f"Successful: {len(self.results['successful'])}")
        print(f"Failed: {len(self.results['failed'])}")

        if self.results['successful']:
            print(f"\n✓ Successful imports:")
            for item in self.results['successful']:
                print(f"  {item['reference']}: {item['message']}")

        if self.results['failed']:
            print(f"\n✗ Failed imports:")
            for item in self.results['failed']:
                print(f"  {item['reference']}: {item['error']}")


if __name__ == '__main__':
    # Example usage
    import sys
    from statement_parser import parse_all_statements

    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_ANON_KEY')

    if not supabase_url or not supabase_key:
        print("Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables required")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: python db_integration.py <pdf_directory>")
        sys.exit(1)

    pdf_dir = sys.argv[1]

    # Parse all statements
    print(f"Parsing PDFs from {pdf_dir}...")
    statements = parse_all_statements(pdf_dir)

    # Import to database
    print(f"\nImporting {len(statements)} statements to database...")
    importer = BatchStatementImporter(supabase_url, supabase_key)
    results = importer.import_all(statements)
    importer.print_summary()
