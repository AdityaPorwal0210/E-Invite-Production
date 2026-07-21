const mongoose = require("mongoose");

const receivedInvitationSchema = new mongoose.Schema({
  invitation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invitation',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rsvpStatus: {
    type: String,
    enum: ['accepted', 'declined', 'tentative'],
    default: 'tentative'
  },
  salutation: {
    type: String,
    default: ''
  },
  // Trails the name, e.g. "& Family" -> "Dear Mr. & Mrs. Sharma & Family"
  suffix: {
    type: String,
    default: ''
  },
  // Host-only estimate of how many people this invite represents (family size).
  // Not shown to the guest; summed for the event's total expected headcount.
  expectedCount: {
    type: Number,
    default: 1,
    min: 0
  },
  // Host-applied, event-specific labels: "VIP", "Bride's side", "Needs hotel", custom...
  tags: [{
    type: String,
    trim: true
  }],
  // Host request for the guest's ID (e.g. for a hotel booking)
  idRequest: {
    requested: { type: Boolean, default: false },
    requestedAt: { type: Date, default: null },
    note: { type: String, default: '' } // optional host message shown to the guest
  },
  // Guest consented to sharing their ID with the host
  idConsent: {
    type: Boolean,
    default: false
  },
  // Uploaded ID documents. We store the Cloudinary publicId (NOT a public URL);
  // viewing generates a short-lived signed link on demand.
  idDocuments: [{
    publicId: { type: String, required: true },
    format: { type: String, default: 'jpg' },
    label: { type: String, default: '' }, // e.g. "Front", "Back"
    uploadedAt: { type: Date, default: Date.now }
  }],
  isSaved: {
    type: Boolean,
    default: false
  },
  ticketId: {
    type: String,
    default: null
  },
  // Day-of check-in (QR scan at the gate)
  checkedIn: {
    type: Boolean,
    default: false
  },
  checkedInAt: {
    type: Date,
    default: null
  },
  notifiedAt: {
    type: Date,
    default: Date.now
  },
  isRead: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Indexes: inbox lookups by recipient, guest lists by invitation, saved filter, and dedupe per (invitation, recipient)
receivedInvitationSchema.index({ recipient: 1, createdAt: -1 });
receivedInvitationSchema.index({ invitation: 1 });
receivedInvitationSchema.index({ recipient: 1, isSaved: 1 });
receivedInvitationSchema.index({ invitation: 1, recipient: 1 });
receivedInvitationSchema.index({ invitation: 1, ticketId: 1 }); // fast QR check-in lookup

module.exports = mongoose.model("ReceivedInvitation", receivedInvitationSchema);
