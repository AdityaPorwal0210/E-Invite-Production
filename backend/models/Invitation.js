const mongoose = require("mongoose");

const invitationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  sharedGroups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  }],
  invitedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  pendingGuestEmails: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  title: {
    type: String,
    required: [true, "Title is required"],
    trim: true,
    maxLength: [100, "Title cannot exceed 100 characters"]
  },
  description: {
    type: String,
    trim: true
  },
  eventDate: {
    type: Date,
    required: [true, "Event date is required"]
  },
  location: {
    type: String,
    required: [true, "Location is required"]
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User' // THIS is the magic word. It tells Mongoose exactly which collection to search.
  },
  coverImage: {
    type: String, // Cloudinary URL
    default: null
  },
  attachments: [{
    url: String,
    fileType: String,
    name: String
  }],
  videoUrl: {
    type: String,
    default: null
  },
  googleMapsLink: {
    type: String,
    default: null
  },
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    rsvpStatus: {
      type: String,
      enum: ['Pending', 'Attending', 'Declined'],
      default: 'Pending'
    },
    ticketId: String
  }]
}, { timestamps: true });

module.exports = mongoose.model("Invitation", invitationSchema);