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
  isSaved: {
    type: Boolean,
    default: false
  },
  ticketId: {
    type: String,
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

module.exports = mongoose.model("ReceivedInvitation", receivedInvitationSchema);
