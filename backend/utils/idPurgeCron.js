const cron = require('node-cron');
const Invitation = require('../models/Invitation');
const ReceivedInvitation = require('../models/ReceivedInvitation');
const { deleteFromCloudinary } = require('./cloudinary');

// How many days after an event we keep collected IDs before auto-purging them.
const RETENTION_DAYS = Number(process.env.ID_RETENTION_DAYS || 7);

/**
 * Runs daily. Finds events that ended more than RETENTION_DAYS ago and deletes
 * every uploaded ID document (from Cloudinary AND the DB), so identity documents
 * are never stored indefinitely.
 */
const startIdPurgeCron = () => {
  // '30 3 * * *' → every day at 03:30
  cron.schedule('30 3 * * *', async () => {
    console.log('🧹 CRON: Purging expired guest ID documents...');
    try {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

      // Events whose date is older than the retention cutoff
      const pastEvents = await Invitation.find({ eventDate: { $lt: cutoff } }).select('_id');
      if (pastEvents.length === 0) {
        console.log('No past events to purge IDs for.');
        return;
      }
      const pastEventIds = pastEvents.map(e => e._id);

      // Only records that still carry documents
      const records = await ReceivedInvitation.find({
        invitation: { $in: pastEventIds },
        'idDocuments.0': { $exists: true },
      });

      let purgedDocs = 0;
      for (const record of records) {
        for (const doc of record.idDocuments) {
          await deleteFromCloudinary(doc.publicId);
          purgedDocs++;
        }
        record.idDocuments = [];
        record.idConsent = false;
        await record.save();
      }

      console.log(`🧹 Purged ${purgedDocs} ID document(s) across ${records.length} guest record(s).`);
    } catch (error) {
      console.error('❌ ID PURGE CRON ERROR:', error);
    }
  });

  console.log(`🧹 ID auto-purge cron initialized (retention: ${RETENTION_DAYS} days).`);
};

module.exports = startIdPurgeCron;
