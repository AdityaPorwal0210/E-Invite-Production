const mongoose = require("mongoose");

/**
 * A reusable, event-independent list of guests.
 *
 * Hosts create lists per function ("Reception", "DJ Night", "After Party"),
 * fill them with guests (including people who have no account yet), and then
 * select one or more lists when sending invites for any event.
 *
 * This is deliberately separate from the `Group` model: Groups are social
 * groups of registered users who join via links and have admins/permissions.
 * A GuestList is a private address-book style list owned by one host.
 */
const guestEntrySchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    default: ''
  },
  // Prefix before the name: "Mr.", "Mrs.", "Ms.", "Dr.", "Shri", "Smt.",
  // "Mr. & Mrs.", "Sh. & Smt." — builds "Dear Mr. & Mrs. Sharma"
  salutation: {
    type: String,
    trim: true,
    default: ''
  },
  // Suffix after the name: "& Family", "and Family", "& Co."
  // Together these give "Dear Mr. & Mrs. Sharma & Family"
  suffix: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: ''
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  // Linked account, if this guest is already a registered user
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // How many people this invite is expected to bring (host-only figure)
  expectedCount: {
    type: Number,
    default: 1,
    min: 0
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

const guestListSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, "List name is required"],
    trim: true,
    maxLength: [100, "List name cannot exceed 100 characters"]
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  guests: [guestEntrySchema]
}, { timestamps: true });

// Hosts fetch their own lists constantly; index the owner.
guestListSchema.index({ owner: 1, createdAt: -1 });

// Convenience: total expected headcount for the whole list
guestListSchema.virtual('totalExpected').get(function () {
  return (this.guests || []).reduce((sum, g) => sum + (g.expectedCount || 0), 0);
});

/**
 * Compose the full addressed name for a guest entry.
 * e.g. { salutation: "Mr. & Mrs.", name: "Sharma", suffix: "& Family" }
 *      -> "Mr. & Mrs. Sharma & Family"
 * Exported so the invite flow builds greetings identically.
 */
guestEntrySchema.methods.displayName = function () {
  return [this.salutation, this.name, this.suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

guestListSchema.set('toJSON', { virtuals: true });
guestListSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model("GuestList", guestListSchema);
