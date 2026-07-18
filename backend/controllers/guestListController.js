const GuestList = require('../models/GuestList');
const User = require('../models/User');

/**
 * Build the addressed name for a guest entry.
 * { salutation: "Mr. & Mrs.", name: "Sharma", suffix: "& Family" }
 *   -> "Mr. & Mrs. Sharma & Family"
 */
const composeDisplayName = (guest = {}) =>
  [guest.salutation, guest.name, guest.suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Try to link a guest entry to an existing registered user by email or phone,
 * so invites reach their in-app inbox instead of only their email.
 */
const findLinkedUser = async ({ email, phone }) => {
  const conditions = [];
  if (email) conditions.push({ email: email.toLowerCase().trim() });
  if (phone) {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    conditions.push({ phoneNumber: cleanPhone }, { secondaryPhone: cleanPhone });
  }
  if (conditions.length === 0) return null;

  const user = await User.findOne({ $or: conditions }).select('_id');
  return user ? user._id : null;
};

// Normalise one incoming guest payload into a schema-shaped entry
const normaliseGuest = async (raw = {}) => ({
  name: (raw.name || '').trim(),
  salutation: (raw.salutation || '').trim(),
  suffix: (raw.suffix || '').trim(),
  email: (raw.email || '').toLowerCase().trim(),
  phone: (raw.phone || '').trim(),
  expectedCount: Number.isFinite(Number(raw.expectedCount)) ? Number(raw.expectedCount) : 1,
  notes: (raw.notes || '').trim(),
  user: await findLinkedUser(raw)
});

// Guard: the list must exist AND belong to the requesting host
const getOwnedList = async (listId, userId) => {
  const list = await GuestList.findById(listId);
  if (!list) return { error: { status: 404, message: 'Guest list not found' } };
  if (list.owner.toString() !== userId) {
    return { error: { status: 403, message: 'Not authorized to access this guest list' } };
  }
  return { list };
};

// @desc   Create a new guest list
// @route  POST /api/guest-lists
// @access Private
const createGuestList = async (req, res) => {
  try {
    const { name, description, guests } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'List name is required' });
    }

    let initialGuests = [];
    if (Array.isArray(guests) && guests.length > 0) {
      initialGuests = await Promise.all(guests.map(normaliseGuest));
    }

    const list = await GuestList.create({
      owner: req.user.id,
      name: name.trim(),
      description: (description || '').trim(),
      guests: initialGuests
    });

    res.status(201).json(list);
  } catch (error) {
    console.error('Create Guest List Error:', error);
    res.status(500).json({ message: 'Server error while creating guest list' });
  }
};

// @desc   Get all guest lists owned by the host (summary view)
// @route  GET /api/guest-lists
// @access Private
const getMyGuestLists = async (req, res) => {
  try {
    const lists = await GuestList.find({ owner: req.user.id }).sort({ createdAt: -1 });

    // Return lightweight summaries — the full guest array is fetched per list
    const summaries = lists.map(list => ({
      _id: list._id,
      name: list.name,
      description: list.description,
      guestCount: list.guests.length,
      totalExpected: list.guests.reduce((sum, g) => sum + (g.expectedCount || 0), 0),
      createdAt: list.createdAt,
      updatedAt: list.updatedAt
    }));

    res.status(200).json({ lists: summaries });
  } catch (error) {
    console.error('Get Guest Lists Error:', error);
    res.status(500).json({ message: 'Server error while fetching guest lists' });
  }
};

// @desc   Get one guest list with all its guests
// @route  GET /api/guest-lists/:id
// @access Private
const getGuestListById = async (req, res) => {
  try {
    const { list, error } = await getOwnedList(req.params.id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    res.status(200).json(list);
  } catch (error) {
    console.error('Get Guest List Error:', error);
    res.status(500).json({ message: 'Server error while fetching guest list' });
  }
};

// @desc   Rename / update list details
// @route  PUT /api/guest-lists/:id
// @access Private
const updateGuestList = async (req, res) => {
  try {
    const { list, error } = await getOwnedList(req.params.id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    const { name, description } = req.body;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: 'List name cannot be empty' });
      list.name = name.trim();
    }
    if (description !== undefined) list.description = description.trim();

    await list.save();
    res.status(200).json(list);
  } catch (error) {
    console.error('Update Guest List Error:', error);
    res.status(500).json({ message: 'Server error while updating guest list' });
  }
};

// @desc   Delete a guest list
// @route  DELETE /api/guest-lists/:id
// @access Private
const deleteGuestList = async (req, res) => {
  try {
    const { list, error } = await getOwnedList(req.params.id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    await list.deleteOne();
    res.status(200).json({ message: 'Guest list deleted' });
  } catch (error) {
    console.error('Delete Guest List Error:', error);
    res.status(500).json({ message: 'Server error while deleting guest list' });
  }
};

// @desc   Add one or many guests to a list
// @route  POST /api/guest-lists/:id/guests
// @access Private
const addGuests = async (req, res) => {
  try {
    const { list, error } = await getOwnedList(req.params.id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    // Accepts either a single guest object or { guests: [...] } for bulk/import
    const incoming = Array.isArray(req.body.guests) ? req.body.guests : [req.body];
    const valid = incoming.filter(g => (g.name && g.name.trim()) || g.email || g.phone);

    if (valid.length === 0) {
      return res.status(400).json({ message: 'Each guest needs at least a name, email, or phone' });
    }

    const entries = await Promise.all(valid.map(normaliseGuest));
    list.guests.push(...entries);
    await list.save();

    res.status(201).json(list);
  } catch (error) {
    console.error('Add Guests Error:', error);
    res.status(500).json({ message: 'Server error while adding guests' });
  }
};

// @desc   Update a single guest entry
// @route  PUT /api/guest-lists/:id/guests/:guestId
// @access Private
const updateGuest = async (req, res) => {
  try {
    const { list, error } = await getOwnedList(req.params.id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    const guest = list.guests.id(req.params.guestId);
    if (!guest) return res.status(404).json({ message: 'Guest not found in this list' });

    const fields = ['name', 'salutation', 'suffix', 'email', 'phone', 'notes'];
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        guest[field] = field === 'email'
          ? req.body[field].toLowerCase().trim()
          : req.body[field].trim();
      }
    });

    if (req.body.expectedCount !== undefined) {
      const count = Number(req.body.expectedCount);
      guest.expectedCount = Number.isFinite(count) && count >= 0 ? count : guest.expectedCount;
    }

    // Contact details may have changed — re-check for a linked account
    if (req.body.email !== undefined || req.body.phone !== undefined) {
      guest.user = await findLinkedUser({ email: guest.email, phone: guest.phone });
    }

    await list.save();
    res.status(200).json(list);
  } catch (error) {
    console.error('Update Guest Error:', error);
    res.status(500).json({ message: 'Server error while updating guest' });
  }
};

// @desc   Remove a guest from a list
// @route  DELETE /api/guest-lists/:id/guests/:guestId
// @access Private
const removeGuest = async (req, res) => {
  try {
    const { list, error } = await getOwnedList(req.params.id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    const guest = list.guests.id(req.params.guestId);
    if (!guest) return res.status(404).json({ message: 'Guest not found in this list' });

    guest.deleteOne();
    await list.save();

    res.status(200).json(list);
  } catch (error) {
    console.error('Remove Guest Error:', error);
    res.status(500).json({ message: 'Server error while removing guest' });
  }
};

// @desc   Duplicate a list (handy: "Reception" -> "After Party" starting point)
// @route  POST /api/guest-lists/:id/duplicate
// @access Private
const duplicateGuestList = async (req, res) => {
  try {
    const { list, error } = await getOwnedList(req.params.id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    const copy = await GuestList.create({
      owner: req.user.id,
      name: (req.body.name || `${list.name} (copy)`).trim(),
      description: list.description,
      guests: list.guests.map(g => ({
        name: g.name,
        salutation: g.salutation,
        suffix: g.suffix,
        email: g.email,
        phone: g.phone,
        user: g.user,
        expectedCount: g.expectedCount,
        notes: g.notes
      }))
    });

    res.status(201).json(copy);
  } catch (error) {
    console.error('Duplicate Guest List Error:', error);
    res.status(500).json({ message: 'Server error while duplicating guest list' });
  }
};

// @desc   Export a guest list as CSV
// @route  GET /api/guest-lists/:id/export
// @access Private
const exportGuestList = async (req, res) => {
  try {
    const { list, error } = await getOwnedList(req.params.id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    const escapeCSV = (value) => {
      const str = value === null || value === undefined ? '' : String(value);
      // Wrap in quotes if it contains a comma, quote, or newline
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = ['Name', 'Salutation', 'Suffix', 'Addressed As', 'Email', 'Phone', 'Expected Count', 'Notes'];

    const rows = list.guests.map(g => [
      escapeCSV(g.name),
      escapeCSV(g.salutation),
      escapeCSV(g.suffix),
      escapeCSV(composeDisplayName(g)),
      escapeCSV(g.email),
      escapeCSV(g.phone),
      escapeCSV(g.expectedCount),
      escapeCSV(g.notes)
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    const safeName = list.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName || 'guest-list'}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('Export Guest List Error:', error);
    res.status(500).json({ message: 'Server error while exporting guest list' });
  }
};

module.exports = {
  createGuestList,
  getMyGuestLists,
  getGuestListById,
  updateGuestList,
  deleteGuestList,
  addGuests,
  updateGuest,
  removeGuest,
  duplicateGuestList,
  exportGuestList,
  composeDisplayName
};
