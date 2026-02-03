const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const idx = line.indexOf('=');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
}

const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Missing Supabase envs');
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const slug = process.argv[2] || 'demo-salon';

const users = [
  { email: 'bartosz.rogala@yahoo.pl', role: 'owner', makeEmployee: false },
  { email: 'lowca.motyli@gmail.com', role: 'manager', makeEmployee: true },
  { email: 'hotstestowy@protonmail.com', role: 'employee', makeEmployee: true },
];

async function findUserByEmail(email) {
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return { user: null, error };

    const user = data.users.find((candidate) => (candidate.email || '').toLowerCase() === email);
    if (user) return { user, error: null };

    if (data.users.length < perPage) return { user: null, error: null };
    page += 1;
  }
}

async function main() {
  const { data: salon, error: salonError } = await supabase
    .from('salons')
    .select('id, slug')
    .eq('slug', slug)
    .single();

  if (salonError) throw salonError;

  for (const entry of users) {
    const email = entry.email.toLowerCase();
    const { user: foundUser, error: foundError } = await findUserByEmail(email);
    if (foundError) throw foundError;

    let authUser = foundUser;
    if (!authUser) {
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { salon_id: salon.id, role: entry.role },
      });
      if (inviteError) throw inviteError;
      authUser = inviteData.user;
    }

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (existingProfileError) throw existingProfileError;

    if (existingProfile) {
      const { error: updateProfileError } = await supabase
        .from('profiles')
        .update({ salon_id: salon.id, role: entry.role, full_name: email.split('@')[0] })
        .eq('user_id', authUser.id);
      if (updateProfileError) throw updateProfileError;
    } else {
      const { error: insertProfileError } = await supabase
        .from('profiles')
        .insert({ user_id: authUser.id, salon_id: salon.id, role: entry.role, full_name: email.split('@')[0] });
      if (insertProfileError) throw insertProfileError;
    }

    if (entry.makeEmployee) {
      const { data: existingEmployee, error: existingEmployeeError } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (existingEmployeeError) throw existingEmployeeError;

      if (!existingEmployee) {
        let employeeCode = null;
        const { data: codeData } = await supabase.rpc('generate_employee_code', { salon_uuid: salon.id });
        if (codeData) employeeCode = codeData;
        if (!employeeCode) employeeCode = `E${Date.now().toString().slice(-6)}`;

        const nameParts = email.split('@')[0].replace(/[^a-z0-9]+/gi, ' ').trim().split(' ');
        const firstName = nameParts[0] || 'Test';
        const lastName = nameParts.slice(1).join(' ') || null;

        const { error: insertEmployeeError } = await supabase.from('employees').insert({
          salon_id: salon.id,
          user_id: authUser.id,
          employee_code: employeeCode,
          first_name: firstName,
          last_name: lastName,
          email,
          active: true,
          base_threshold: 0,
          base_salary: 0,
          commission_rate: 0,
        });
        if (insertEmployeeError) throw insertEmployeeError;
      }
    }
  }

  console.log('Test users ready for salon', salon.slug, salon.id);
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
