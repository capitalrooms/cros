const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fihjzzxxhprxgjuefgtb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpaGp6enh4aHByeGdqdWVmZ3RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTg3MDA0MywiZXhwIjoyMTAxNDQ2MTQzfQ.WUxU1VWaQc4jpVuOJb7GLqe2ZN4v5C4HIm0HDYZev0k';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const users = [
  { email: 'landlord@example.co.uk', password: '123', name: 'Capital Rooms Landlord' },
  { email: 'karina@example.com', password: '123', name: 'Karina Bermudez' },
  { email: 'elizabeth@example.com', password: '123', name: 'Elizabeth Vogel' },
  { email: 'don@example.com', password: '123', name: 'Don Pubudu' },
  { email: 'sebastian@example.com', password: '123', name: 'Sebastian Elliott' },
  { email: 'aslan@example.com', password: '123', name: 'Aslan Almukhambetov' },
  { email: 'alyssa@example.com', password: '123', name: "Alyssa Miles O'Bray" },
  { email: 'ava@example.com', password: '123', name: 'Ava Eldridge' },
];

async function createUsers() {
  console.log('Creating auth users...\n');

  for (const user of users) {
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          full_name: user.name,
        },
      });

      if (error) {
        console.error(`❌ ${user.email}: ${error.message}`);
      } else {
        console.log(`✅ ${user.email}: ${data.user.id}`);
      }
    } catch (err) {
      console.error(`❌ ${user.email}: ${err.message}`);
    }
  }

  console.log('\nDone!');
}

createUsers();
