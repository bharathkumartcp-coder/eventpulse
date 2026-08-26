require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const supabase = require('../config/supabase');

async function seed() {
  console.log('🌱 Starting EventPulse database seeding...');

  try {
    // 1. Create or retrieve Demo Organizer
    const demoEmail = 'organizer@eventpulse.dev';
    const demoPass = 'EventPulse2025!';
    const hashedPassword = await bcrypt.hash(demoPass, 12);

    let { data: organizer } = await supabase
      .from('organizers')
      .select('id, name, email')
      .eq('email', demoEmail)
      .single();

    if (!organizer) {
      const { data: newOrg, error: orgErr } = await supabase
        .from('organizers')
        .insert({
          name: 'Chief Event Lead',
          email: demoEmail,
          password: hashedPassword,
        })
        .select()
        .single();

      if (orgErr) throw orgErr;
      organizer = newOrg;
      console.log('✅ Created Demo Organizer:', organizer.email);
    } else {
      console.log('ℹ️ Existing Demo Organizer found:', organizer.email);
    }

    // 2. Create Demo Event
    const eventName = 'Global Cloud & AI Summit 2025';
    let { data: event } = await supabase
      .from('events')
      .select('id, name')
      .eq('name', eventName)
      .eq('created_by', organizer.id)
      .single();

    if (!event) {
      const { data: newEvent, error: evErr } = await supabase
        .from('events')
        .insert({
          name: eventName,
          description: 'The premier international conference on Cloud Architecture, Distributed Systems, and Generative AI.',
          venue: 'San Francisco Tech Pavilion - Hall 4A',
          event_date: new Date().toISOString().split('T')[0],
          start_time: '09:00:00',
          created_by: organizer.id,
        })
        .select()
        .single();

      if (evErr) throw evErr;
      event = newEvent;
      console.log('✅ Created Demo Event:', event.name, `(${event.id})`);
    } else {
      console.log('ℹ️ Existing Demo Event found:', event.name);
    }

    // 3. Seed Attendees
    const sampleAttendees = [
      { name: 'Dr. Aris Thorne', email: 'aris.thorne@quantumtech.io' },
      { name: 'Elena Rostova', email: 'elena.rostova@cloudscale.net' },
      { name: 'Marcus Sterling', email: 'marcus.sterling@devmatrix.org' },
      { name: 'Priya Sundaram', email: 'priya.sundaram@innovate.ai' },
      { name: 'Zackariah Vance', email: 'zack.vance@cyberpulse.tech' },
      { name: 'Sophia Lin', email: 'sophia.lin@hypergrowth.co' },
      { name: 'Daniel K. Miller', email: 'daniel.miller@openprotocol.io' },
      { name: 'Amina Al-Mansoor', email: 'amina.mansoor@futureweb.org' },
      { name: 'Liam O\'Connor', email: 'liam.oconnor@vertexsys.com' },
      { name: 'Kavita Patel', email: 'kavita.patel@nextgenai.dev' },
    ];

    const attendeePayloads = sampleAttendees.map(a => ({
      event_id: event.id,
      name: a.name,
      email: a.email,
      qr_token: crypto.randomBytes(24).toString('hex'),
      registration_status: 'registered',
    }));

    const { data: attendees, error: attErr } = await supabase
      .from('attendees')
      .upsert(attendeePayloads, { onConflict: 'event_id,email' })
      .select();

    if (attErr) throw attErr;
    console.log(`✅ Seeded ${attendees.length} attendees.`);

    // 4. Seed initial Check-Ins for the first 3 attendees
    const entryPoints = ['Main Gate', 'Gate A', 'VIP Entry'];
    for (let i = 0; i < Math.min(3, attendees.length); i++) {
      const att = attendees[i];
      await supabase
        .from('checkins')
        .upsert({
          event_id: event.id,
          attendee_id: att.id,
          entry_point: entryPoints[i % entryPoints.length],
        }, { onConflict: 'event_id,attendee_id', ignoreDuplicates: true });
    }
    console.log('✅ Seeded 3 initial check-in records.');

    // 5. Seed some sample invalid scan logs
    await supabase.from('invalid_scan_logs').insert([
      {
        event_id: event.id,
        scanned_value: 'bad_token_example_123',
        entry_point: 'Gate B',
        reason: 'UNKNOWN_QR',
      },
      {
        event_id: event.id,
        scanned_value: `eventpulse:${event.id}:${attendees[0].qr_token}`,
        entry_point: 'Main Gate',
        reason: 'ALREADY_CHECKED_IN',
      }
    ]);
    console.log('✅ Seeded sample invalid scan logs.');

    console.log('\n======================================================');
    console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
    console.log('======================================================');
    console.log('Organizer Login:');
    console.log(`  Email:    ${demoEmail}`);
    console.log(`  Password: ${demoPass}`);
    console.log(`Event ID:   ${event.id}`);
    console.log('\nSample Test Attendee QR Tokens (for scanning/manual entry):');
    attendees.slice(0, 5).forEach((a, i) => {
      console.log(`  [${i + 1}] ${a.name} (${a.email})`);
      console.log(`      Token:   ${a.qr_token}`);
      console.log(`      Payload: eventpulse:${event.id}:${a.qr_token}`);
    });
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
