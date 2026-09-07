import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('movilizador_trips')
    .select('*')
    .eq('fecha', today);
    
  console.log('Error:', error);
  console.log(`Total trips today (${today}):`, data?.length);
  if (data && data.length > 0) {
    console.log(data.slice(0, 2));
  }
}

test();
