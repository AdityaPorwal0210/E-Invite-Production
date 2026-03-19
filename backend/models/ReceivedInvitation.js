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

module.exports = mongoose.model("ReceivedInvitation", receivedInvitationSchema);
