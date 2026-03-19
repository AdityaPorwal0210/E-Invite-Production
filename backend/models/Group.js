const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Group name is required"],
    trim: true,
    maxLength: [50, "Name cannot exceed 50 characters"]
  },
  description: {
    type: String,
    trim: true,
    maxLength: [500, "Description cannot exceed 500 characters"]
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  joinRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  joinSetting: {
    type: String,
    enum: ['invite_only', 'request_to_join'],
    default: 'invite_only'
  },
  coverImage: {
    type: String,
    default: null
  },
  groupImage: {
    type: String,
    default: ''
  },
  inviteCode: {
    type: String,
    unique: true,
    sparse: true // Allows null values while maintaining uniqueness
  }
}, { timestamps: true });

// Generate unique invite code before saving
groupSchema.pre('save', async function(next) {
  if (!this.inviteCode) {
    this.inviteCode = this._id.toString();
  }
});

module.exports = mongoose.model("Group", groupSchema);
