import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Initialize Supabase and Resend using your GitHub Secrets
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

async function checkLateEmployees() {
  const now = new Date();
  
  // Format current time and 15 mins ago for comparison (HH:mm:ss)
  const currentTime = now.toISOString().split('T')[1].substring(0, 8);
  const fifteenMinsAgo = new Date(now.getTime() - 15 * 60000).toISOString().split('T')[1].substring(0, 8);

  console.log(`Checking for late arrivals between ${fifteenMinsAgo} and ${currentTime}...`);

  // 1. Query employees who:
  // - Haven't clocked in (is_clocked_in = false)
  // - Were scheduled to start between 15 mins ago and now
  const { data: lateEmployees, error } = await supabase
    .from('employees') 
    .select('email, first_name, scheduled_start')
    .eq('is_clocked_in', false)
    .gte('scheduled_start', fifteenMinsAgo)
    .lte('scheduled_start', currentTime);

  if (error) {
    console.error('Supabase Error:', error);
    return;
  }

  if (!lateEmployees || lateEmployees.length === 0) {
    console.log('No late employees found in this window.');
    return;
  }

  // 2. Loop through results and send emails
  for (const employee of lateEmployees) {
    try {
      await resend.emails.send({
        from: 'onboarding@resend.dev', // Replace with your verified domain later
        to: employee.email,
        subject: 'Clock-in Reminder',
        html: `<p>Hello ${employee.first_name},</p>
               <p>Our records show you were scheduled to start at <strong>${employee.scheduled_start}</strong> and haven't clocked in yet.</p>
               <p>Please clock in as soon as possible.</p>`
      });
      console.log(`Email sent to: ${employee.email}`);
    } catch (emailError) {
      console.error(`Failed to send email to ${employee.email}:`, emailError);
    }
  }
}

checkLateEmployees();
