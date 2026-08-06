#!/bin/bash

# Apply Lettings Schema Migration via Supabase SQL Editor
# This script provides the SQL to run in the Supabase web console

echo "=================================="
echo "Lettings Schema Migration SQL"
echo "=================================="
echo ""
echo "Follow these steps:"
echo ""
echo "1. Go to: https://supabase.com/dashboard"
echo "2. Open your 'Capital Rooms' project"
echo "3. Click 'SQL Editor' in the left sidebar"
echo "4. Click 'New Query'"
echo "5. Copy ALL the SQL below"
echo "6. Paste it into the SQL Editor"
echo "7. Click 'Run'"
echo ""
echo "=================================="
echo "START COPY HERE"
echo "=================================="
echo ""

cat supabase/migrations/012_complete_lettings_setup.sql

echo ""
echo "=================================="
echo "END COPY HERE"
echo "=================================="
echo ""
echo "After running, refresh the page and the Lettings Dashboard will show rooms!"
