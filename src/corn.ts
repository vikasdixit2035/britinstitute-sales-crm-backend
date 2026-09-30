import cron from 'node-cron';
import reminder from './models/reminder';
import { io } from './server';
import { syncLeadLastContactedFromZoomCalls, zoomPhoneService } from './service/zoomPhone.service';

const shouldRunCron =
  !process.env.NODE_APP_INSTANCE ||
  process.env.NODE_APP_INSTANCE === '0';

let zoomAssignmentSyncRunning = false;
let zoomLastContactInitialSyncComplete = false;

export const runZoomPhoneSync = async () => {
  if (!shouldRunCron || zoomAssignmentSyncRunning) return;

  try {
    zoomAssignmentSyncRunning = true;
    const status = zoomPhoneService.getStatus();
    if (!status.configured) return;

    const defaultLookbackDays = zoomLastContactInitialSyncComplete ? 2 : 30;
    const configuredLookback = Number(
      process.env.ZOOM_PHONE_LAST_CONTACT_LOOKBACK_DAYS || defaultLookbackDays
    );
    const lookbackDays = Number.isFinite(configuredLookback)
      ? Math.min(Math.max(Math.trunc(configuredLookback), 1), 30)
      : defaultLookbackDays;
    const now = new Date();
    const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    const calls = await zoomPhoneService.getContactSyncCalls({
      from,
      to,
      pageSize: 300,
      maxPages: zoomLastContactInitialSyncComplete ? 2 : 5,
      includeRecordings: false
    });
    const updatedLeads = await syncLeadLastContactedFromZoomCalls(calls);
    zoomLastContactInitialSyncComplete = true;
    console.log(`✅ Zoom Phone assignments and last-contacted data synced (${updatedLeads} leads updated)`);
  } catch (error) {
    console.error('🔥 ZOOM PHONE ASSIGNMENT SYNC ERROR:', error);
  } finally {
    zoomAssignmentSyncRunning = false;
  }
};

if (shouldRunCron) {
  console.log('🕒 Reminder cron started');
  console.log('☎️ Zoom Phone assignment sync cron started');

  cron.schedule(process.env.ZOOM_PHONE_ASSIGNMENT_SYNC_CRON || '*/5 * * * *', runZoomPhoneSync);

  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      
      // 1. Fetch reminders AND populate user/lead details in one query
      const dueReminders = await reminder.find({
        remindAt: { $lte: now },
        status: 'pending'
      })
      .populate('user', 'phone name') // Get phone and name from User
      .populate('lead', 'name email phone'); // Get details from Lead

      if (dueReminders.length === 0) return;

      console.log(`📌 Processing ${dueReminders.length} reminders`);

      for (const rem of dueReminders) {
        // Cast to 'any' to avoid TS issues with populated fields
        const populatedRem = rem as any;
        const user = populatedRem.user;
        const lead = populatedRem.lead;

        // 🔔 1. Socket Emit with Lead Info
        io.to(user._id.toString()).emit('reminder', {
          reminderId: rem._id,
          title: rem.title,
          note: rem.note,
          remindAt: rem.remindAt,
          lead: lead ? {
            id: lead._id,
            name: lead.name,
            email: lead.email
          } : null
        });

        // 🆕 2. WhatsApp Reminder
        if (user?.phone) {
          try {
            // Include lead name in the WhatsApp message
            const leadInfo = lead ? `\n👤 Lead: ${lead.name}` : '';
            
            await fetch(
              'https://whatsappchatbot-production-5de4.up.railway.app/send-reminder',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  phone: user.phone,
                  message: `⏰ *Reminder*: ${rem.title}${leadInfo}${
                    rem.note ? `\n📝 Note: ${rem.note}` : ''
                  }`
                })
              }
            );
            console.log(`✅ WhatsApp sent to ${user.phone}`);
          } catch (waError) {
            console.error('❌ WhatsApp API Error:', waError);
          }
        }

        // 3. Mark as triggered
        rem.status = 'triggered';
        await rem.save();
      }
    } catch (error) {
      console.error('🔥 CRON ERROR:', error);
    }
  });
}
