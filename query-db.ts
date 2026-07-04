import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  try {
    console.log("Querying profiles...");
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('*')
      .limit(5);

    if (pError) throw pError;
    console.log("Profiles found:", profiles);

    console.log("Querying organizations...");
    const { data: orgs, error: oError } = await supabase
      .from('organizations')
      .select('*')
      .limit(5);

    if (oError) throw oError;
    console.log("Organizations found:", orgs);

    console.log("Querying organization members...");
    const { data: members, error: mError } = await supabase
      .from('organization_members')
      .select('*')
      .limit(10);

    if (mError) throw mError;
    console.log("Organization Members found:", members);

  } catch (err) {
    console.error("Error querying DB:", err);
  }
}

main();
