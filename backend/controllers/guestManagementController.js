const Invitation = require('../models/Invitation');
const ReceivedInvitation = require('../models/ReceivedInvitation');
const User = require('../models/User');
const sendPushNotification = require('../utils/pushNotification');
const {
  uploadPrivateDocument,
  getSignedDocumentUrl,
  deleteFromCloudinary,
} = require('../utils/cloudinary');

// ID collection is a premium feature, but only enforced while the global
// paywall kill-switch is on — matching the guest-limit and co-host gates.
const idFeatureBlocked = (invitation) =>
  process.env.PAYWALL_ACTIVE === 'true' && !invitation.isPremium;

// Authorise the requester as host or delegate of the event
const loadHostContext = async (invitationId, userId) => {
  const invitation = await Invitation.findById(invitationId);
  if (!invitation) return { error: { status: 404, message: 'Event not found' } };
  const isHost = invitation.user.toString() === userId;
  const isDelegate = invitation.delegates && invitation.delegates.some(d => d.toString() === userId);
  if (!isHost && !isDelegate) return { error: { status: 403, message: 'Not authorized for this event' } };
  return { invitation };
};

// =====================  TAGS  =====================

// @route PUT /api/invitations/:id/guests/:guestId/tags
// @desc  Host sets the event-specific tags for a guest
const setGuestTags = async (req, res) => {
  try {
    const { id, guestId } = req.params;
    const { invitation, error } = await loadHostContext(id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    let { tags } = req.body;
    if (!Array.isArray(tags)) tags = [];
    const clean = [...new Set(
      tags.map(t => (t || '').toString().trim()).filter(Boolean).slice(0, 20)
    )];

    const updated = await ReceivedInvitation.findOneAndUpdate(
      { invitation: id, recipient: guestId },
      { $set: { tags: clean } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Guest not found for this event' });

    res.status(200).json({ message: 'Tags updated', tags: updated.tags });
  } catch (err) {
    console.error('Set Tags Error:', err);
    res.status(500).json({ message: 'Error updating tags' });
  }
};

// =====================  ID REQUEST  =====================

const notifyGuestOfIdRequest = async (recipientId, invitation, note) => {
  try {
    const user = await User.findById(recipientId).select('expoPushToken');
    if (user?.expoPushToken) {
      await sendPushNotification(
        user.expoPushToken,
        'ID requested',
        `The host of "${invitation.title}" has requested your ID${note ? ': ' + note : ' for hotel booking.'}`,
        { type: 'id_request', invitationId: invitation._id.toString() }
      );
    }
  } catch (e) {
    console.error('ID request notify failed:', e.message);
  }
};

// @route POST /api/invitations/:id/guests/:guestId/request-id
// @desc  Host requests one guest's ID (premium feature)
const requestGuestId = async (req, res) => {
  try {
    const { id, guestId } = req.params;
    const { note } = req.body;
    const { invitation, error } = await loadHostContext(id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    if (idFeatureBlocked(invitation)) {
      return res.status(403).json({
        message: 'Collecting guest IDs is a Premium feature. Upgrade this event to enable it.',
        requiresUpgrade: true,
      });
    }

    const updated = await ReceivedInvitation.findOneAndUpdate(
      { invitation: id, recipient: guestId },
      { $set: { 'idRequest.requested': true, 'idRequest.requestedAt': new Date(), 'idRequest.note': (note || '').trim() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Guest not found for this event' });

    await notifyGuestOfIdRequest(guestId, invitation, (note || '').trim());
    res.status(200).json({ message: 'ID requested from guest', idRequest: updated.idRequest });
  } catch (err) {
    console.error('Request ID Error:', err);
    res.status(500).json({ message: 'Error requesting ID' });
  }
};

// @route POST /api/invitations/:id/request-id-by-tag
// @desc  Host requests IDs from everyone carrying a given tag (e.g. "Needs hotel")
const requestIdByTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { tag, note } = req.body;
    const { invitation, error } = await loadHostContext(id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    if (idFeatureBlocked(invitation)) {
      return res.status(403).json({
        message: 'Collecting guest IDs is a Premium feature. Upgrade this event to enable it.',
        requiresUpgrade: true,
      });
    }
    if (!tag || !tag.trim()) return res.status(400).json({ message: 'A tag is required' });

    const targets = await ReceivedInvitation.find({ invitation: id, tags: tag.trim() });
    await ReceivedInvitation.updateMany(
      { invitation: id, tags: tag.trim() },
      { $set: { 'idRequest.requested': true, 'idRequest.requestedAt': new Date(), 'idRequest.note': (note || '').trim() } }
    );

    // Fire notifications (best effort, don't block the response on them)
    for (const t of targets) notifyGuestOfIdRequest(t.recipient, invitation, (note || '').trim());

    res.status(200).json({ message: `ID requested from ${targets.length} guest(s)`, count: targets.length });
  } catch (err) {
    console.error('Request ID By Tag Error:', err);
    res.status(500).json({ message: 'Error requesting IDs' });
  }
};

// =====================  GUEST SIDE  =====================

// @route GET /api/invitations/:id/my-id-request
// @desc  Guest checks whether their ID was requested + their upload status
const getMyIdRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const received = await ReceivedInvitation.findOne({ invitation: id, recipient: req.user.id })
      .select('idRequest idConsent idDocuments');
    if (!received) return res.status(404).json({ message: 'You are not on this guest list' });

    res.status(200).json({
      myId: req.user.id, // so the guest can manage their own documents
      requested: received.idRequest?.requested || false,
      note: received.idRequest?.note || '',
      consent: received.idConsent || false,
      documents: (received.idDocuments || []).map(d => ({
        _id: d._id,
        label: d.label,
        uploadedAt: d.uploadedAt,
      })),
    });
  } catch (err) {
    console.error('Get My ID Request Error:', err);
    res.status(500).json({ message: 'Error loading ID request' });
  }
};

// @route POST /api/invitations/:id/id-documents
// @desc  Guest uploads their ID (requires explicit consent). Stored privately.
const uploadMyId = async (req, res) => {
  try {
    const { id } = req.params;
    const consent = req.body.consent === true || req.body.consent === 'true';

    if (!consent) {
      return res.status(400).json({ message: 'Consent is required before uploading your ID' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No document uploaded' });
    }

    const received = await ReceivedInvitation.findOne({ invitation: id, recipient: req.user.id });
    if (!received) return res.status(404).json({ message: 'You are not on this guest list' });

    // Optional per-file labels (e.g. ["Front","Back"])
    let labels = req.body.labels;
    if (typeof labels === 'string') { try { labels = JSON.parse(labels); } catch { labels = []; } }
    if (!Array.isArray(labels)) labels = [];

    const added = [];
    for (let i = 0; i < req.files.length; i++) {
      const uploaded = await uploadPrivateDocument(req.files[i].path);
      if (uploaded?.publicId) {
        const doc = { publicId: uploaded.publicId, format: uploaded.format || 'jpg', label: (labels[i] || '').toString().trim() };
        received.idDocuments.push(doc);
        added.push(doc);
      }
    }

    received.idConsent = true;
    await received.save();

    res.status(201).json({
      message: 'ID uploaded securely',
      documents: received.idDocuments.map(d => ({ _id: d._id, label: d.label, uploadedAt: d.uploadedAt })),
    });
  } catch (err) {
    console.error('Upload ID Error:', err);
    res.status(500).json({ message: 'Error uploading ID' });
  }
};

// =====================  VIEW / DELETE  =====================

// @route GET /api/invitations/:id/guests/:guestId/id-documents/:docId/view
// @desc  Return a short-lived signed URL. Host/delegate OR the owning guest only.
const viewIdDocument = async (req, res) => {
  try {
    const { id, guestId, docId } = req.params;

    const isOwner = req.user.id === guestId;
    if (!isOwner) {
      const { error } = await loadHostContext(id, req.user.id);
      if (error) return res.status(error.status).json({ message: error.message });
    }

    const received = await ReceivedInvitation.findOne({ invitation: id, recipient: guestId }).select('idDocuments');
    if (!received) return res.status(404).json({ message: 'Guest not found for this event' });

    const doc = received.idDocuments.id(docId);
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const url = getSignedDocumentUrl(doc.publicId, { format: doc.format, expiresInSeconds: 300 });
    res.status(200).json({ url, expiresInSeconds: 300 });
  } catch (err) {
    console.error('View ID Error:', err);
    res.status(500).json({ message: 'Error generating view link' });
  }
};

// @route DELETE /api/invitations/:id/guests/:guestId/id-documents/:docId
// @desc  Delete an ID document. Host/delegate OR the owning guest.
const deleteIdDocument = async (req, res) => {
  try {
    const { id, guestId, docId } = req.params;

    const isOwner = req.user.id === guestId;
    if (!isOwner) {
      const { error } = await loadHostContext(id, req.user.id);
      if (error) return res.status(error.status).json({ message: error.message });
    }

    const received = await ReceivedInvitation.findOne({ invitation: id, recipient: guestId });
    if (!received) return res.status(404).json({ message: 'Guest not found for this event' });

    const doc = received.idDocuments.id(docId);
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    await deleteFromCloudinary(doc.publicId);
    doc.deleteOne();
    await received.save();

    res.status(200).json({ message: 'Document deleted' });
  } catch (err) {
    console.error('Delete ID Error:', err);
    res.status(500).json({ message: 'Error deleting document' });
  }
};

module.exports = {
  setGuestTags,
  requestGuestId,
  requestIdByTag,
  getMyIdRequest,
  uploadMyId,
  viewIdDocument,
  deleteIdDocument,
};
