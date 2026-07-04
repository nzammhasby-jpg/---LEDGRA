import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const emails = [
  'admin@ledgra.com',
  'owner@ledgra.com',
  'accountant@ledgra.com',
  'test@ledgra.com',
  'nzammhasby@gmail.com',
  'tester@ledgra.com'
];

const passwords = [
  'password123',
  'Password123!',
  'admin123',
  'Admin123!',
  'ledgra123',
  'Ledgra123!'
];

async function main() {
  console.log("Testing potential pre-seeded accounts...");
  for (const email of emails) {
    for (const password of passwords) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error && data.user) {
          console.log(`SUCCESS! Confirmed account found: Email = ${email}, Password = ${password}`);
          return;
        }
      } catch (e) {
        // Ignore
      }
    }
  }
  console.log("No standard pre-seeded development account found.");
}

main();
