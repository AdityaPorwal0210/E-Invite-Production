const Invitation = require("../models/Invitation");
const Group = require("../models/Group");
const User = require("../models/User");
const ReceivedInvitation = require("../models/ReceivedInvitation");
const { uploadOnCloudinary, deleteFromCloudinary } = require("../utils/cloudinary");
const sendEmail = require("../utils/sendEmail");
const fs = require('fs');

// Helper to generate URLs for email templates
const getEmailUrls = (invitationId) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const expoIP = process.env.EXPO_DEV_IP || '127.0.0.1';
  const expoPort = process.env.EXPO_PORT || '8081';
  
  const webUrl = `${frontendUrl}/invitation/${invitationId}`;
  
  let mobileUrl;
  console.log('🚨 MEMORY CHECK -> IP:', expoIP, '| PORT:', expoPort);

  if (isDevelopment) {
    mobileUrl = `exp://${expoIP}:${expoPort}/--/invitation/${invitationId}`;
    console.log('🚨 FINAL LINK ->', mobileUrl);
  } else {
    mobileUrl = `${process.env.MOBILE_APP_URL_SCHEME || 'hostapp'}://invitation/${invitationId}`;
  }
  
  console.log('📱 Generated mobile URL:', mobileUrl);
  
  return { webUrl, mobileUrl, frontendUrl };
};

// Helper to build email body with both web and mobile links
const buildInvitationEmailBody = (greeting, invitation, hostName, isUnregistered = false) => {
  const { webUrl, mobileUrl } = getEmailUrls(invitation._id);
  
  const eventDetails = `
Event Details:
- Date: ${new Date(invitation.eventDate).toLocaleDateString()}
- Location: ${isUnregistered ? '(signup to see)' : invitation.location}
`;

  let linkSection = '';
  
  if (mobileUrl) {
    linkSection = `
Open in Mobile App: ${mobileUrl}

Or view in browser: ${webUrl}
`;
  } else {
    linkSection = `
View and RSVP here: ${webUrl}
`;
  }
  
  const signature = `
Best regards,
The Event Team`;

  return `${greeting},

You have been invited to "${invitation.title}" by ${hostName}.

${eventDetails}
${linkSection}
${signature}`;
};

const createInvitation = async (req, res) => {
  try {
    const { title, description, eventDate, location, sharedGroups, invitedUsers, invitedEmails, videoUrl, googleMapsLink } = req.body;

    let groupsArray = [];
    if (sharedGroups) {
      if (Array.isArray(sharedGroups)) {
        groupsArray = sharedGroups;
      } else if (typeof sharedGroups === 'string') {
        try {
          groupsArray = JSON.parse(sharedGroups);
        } catch (e) {
          groupsArray = sharedGroups.split(',').filter(g => g.trim());
        }
      }
    }

    let usersArray = [];
    if (invitedUsers) {
      if (Array.isArray(invitedUsers)) {
        usersArray = invitedUsers;
      } else if (typeof invitedUsers === 'string') {
        try {
          usersArray = JSON.parse(invitedUsers);
        } catch (e) {
          usersArray = invitedUsers.split(',').filter(u => u.trim());
        }
      }
    }

    let emailsArray = [];
    if (invitedEmails) {
      if (Array.isArray(invitedEmails)) {
        emailsArray = invitedEmails;
      } else if (typeof invitedEmails === 'string') {
        try {
          emailsArray = JSON.parse(invitedEmails);
        } catch (e) {
          emailsArray = invitedEmails.split(',').map(e => e.trim().toLowerCase()).filter(e => e);
        }
      }
    }

    let coverImageUrl = null;
    let attachments = [];
    
    if (req.files && req.files.length > 0) {
      const coverFile = req.files[0];
      let remainingFiles = req.files.slice(1);

      if (coverFile.mimetype.startsWith('image/')) {
        const uploadResult = await uploadOnCloudinary(coverFile.path);
        coverImageUrl = uploadResult?.url;
        
        if (fs.existsSync(coverFile.path)) {
          fs.unlinkSync(coverFile.path);
        }
      } else {
        remainingFiles = [coverFile, ...remainingFiles];
      }
      
      for (const file of remainingFiles) {
        const uploadResult = await uploadOnCloudinary(file.path);
        if (uploadResult?.url) {
          attachments.push({
            url: uploadResult.url,
            fileType: file.mimetype,
            name: file.originalname
          });
        }
        
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    let registeredIds = [];
    let unregisteredEmails = [];
    
    if (emailsArray.length > 0) {
      const existingUsers = await User.find({ email: { $in: emailsArray } }).select('_id email');
      const foundEmails = existingUsers.map(u => u.email.toLowerCase());
      
      registeredIds = existingUsers.map(u => u._id.toString());
      unregisteredEmails = emailsArray.filter(e => !foundEmails.includes(e.toLowerCase()));
      
      usersArray = [...usersArray, ...registeredIds];
    }

    const invitation = await Invitation.create({
      user: req.user.id,
      host: req.user.id,
      sharedGroups: groupsArray,
      invitedUsers: usersArray,
      pendingGuestEmails: unregisteredEmails,
      title,
      description,
      eventDate,
      location,
      coverImage: coverImageUrl,
      attachments: attachments,
      videoUrl: videoUrl || null,
      googleMapsLink: googleMapsLink || null
    });

    const allRecipientIds = new Set();
    
    if (groupsArray.length > 0) {
      for (const groupId of groupsArray) {
        const group = await Group.findById(groupId);
        if (group) {
          group.members.forEach(memberId => {
            if (memberId.toString() !== req.user.id) {
              allRecipientIds.add(memberId.toString());
            }
          });
        }
      }
    }
    
    if (usersArray.length > 0) {
      usersArray.forEach(userId => {
        if (userId.toString() !== req.user.id) {
          allRecipientIds.add(userId.toString());
        }
      });
    }

    const hostUser = await User.findById(req.user.id).select('name');
    const hostName = hostUser?.name || 'Someone';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    if (allRecipientIds.size > 0) {
      const recipientIds = Array.from(allRecipientIds);
      await Promise.all(
        recipientIds.map(recipientId => 
              ReceivedInvitation.findOneAndUpdate(
                { invitation: invitation._id, recipient: recipientId },
                { 
                  invitation: invitation._id, 
                  recipient: recipientId,
                  rsvpStatus: 'tentative'
                },
                { upsert: true, new: true }
              )
        )
      );
      
      const recipientUsers = await User.find({ _id: { $in: recipientIds } }).select('email name');
      
      for (const recipient of recipientUsers) {
        // Do not send emails to our placeholder phone guests
        if (recipient.email && !recipient.email.includes('@placeholder.com')) {
          try {
            await sendEmail({
              to: recipient.email,
              subject: `You're invited: ${invitation.title}`,
              text: `Hello ${recipient.name || 'Guest'},\n\nYou have been invited to "${invitation.title}" by ${hostName}.\n\nEvent Details:\n- Date: ${new Date(invitation.eventDate).toLocaleDateString()}\n- Location: ${invitation.location}\n\nClick here to view and RSVP: ${frontendUrl}/invitation/${invitation._id}\n\nBest regards,\nThe Event Team`
            });
          } catch (emailError) {
            console.error(`Failed to send email to ${recipient.email}:`, emailError);
          }
        }
      }
    }

    for (const email of unregisteredEmails) {
      try {
        await sendEmail({
          to: email,
          subject: `You've been invited to ${invitation.title}! (Action Required)`,
          text: `Hello,\n\nYou have been invited to "${invitation.title}" by ${hostName} on ${new Date(invitation.eventDate).toLocaleDateString()}.\n\n📍 Location: (signup to see)\n\nTo unlock the full details, view the location, and RSVP, please create a free account:\n\n${frontendUrl}/invitation/${invitation._id}\n\nBest regards,\nThe Event Team`
        });
      } catch (emailError) {
        console.error(`Failed to send email to ${email}:`, emailError);
      }
    }

    res.status(201).json(invitation);
  } catch (error) {
    console.error("Controller Error:", error);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: "Internal server error" });
  }
};

const getInvitations = async (req, res) => {
  try {
    const invitations = await Invitation.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .populate('host', 'name email')
      .populate('sharedGroups', 'name')
      .populate('invitedUsers', 'name email');

    res.status(200).json({
      count: invitations.length,
      invitations
    });
  } catch (error) {
    console.error("Fetch Error:", error);
    res.status(500).json({ message: "Server error while fetching invitations" });
  }
};

const getInvitationById = async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user?.email?.toLowerCase();
    
    const invitation = await Invitation.findById(id)
      .populate('host', 'name email')
      .populate('sharedGroups', 'name');

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    const isHost = invitation.user.toString() === req.user.id;

    if (isHost) {
      const guestList = await ReceivedInvitation.find({ invitation: id })
        .populate('recipient', 'name email')
        .sort({ rsvpStatus: 1 });
      
      return res.status(200).json({ 
        ...invitation.toObject(), 
        guestList,
        pendingGuestEmails: invitation.pendingGuestEmails || []
      });
    }

    const pendingEmails = invitation.pendingGuestEmails || [];
    const isPendingGuest = userEmail && pendingEmails.includes(userEmail);

    const received = await ReceivedInvitation.findOne({ 
      invitation: id, 
      recipient: req.user.id 
    }).select('rsvpStatus salutation isSaved isRead');

    if (isPendingGuest && !received) {
      await Invitation.findByIdAndUpdate(id, {
        $addToSet: { invitedUsers: req.user.id },
        $pull: { pendingGuestEmails: userEmail }
      });
      
      await ReceivedInvitation.create({
        invitation: id,
        recipient: req.user.id,
        rsvpStatus: 'tentative'
      });
    }

    res.status(200).json({ 
      ...invitation.toObject(), 
      myRsvp: received ? received.rsvpStatus : null,
      mySalutation: received ? received.salutation : '',
      isSaved: received ? received.isSaved : false,
      isRead: received ? received.isRead : false,
      isPendingGuest: isPendingGuest
    });
  } catch (error) {
    console.error("Fetch By ID Error:", error);
    res.status(500).json({ message: "Server error while fetching invitation" });
  }
};

const updateRSVP = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['accepted', 'declined', 'tentative'].includes(status)) {
      return res.status(400).json({ message: "Invalid RSVP status" });
    }

    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    const result = await ReceivedInvitation.findOneAndUpdate(
      { invitation: id, recipient: req.user.id },
      { rsvpStatus: status },
      { upsert: true, new: true }
    ).populate('recipient', 'name email');

    res.status(200).json(result);
  } catch (error) {
    console.error("RSVP Error:", error);
    res.status(500).json({ message: "Server error while updating RSVP" });
  }
};

const getReceivedInvitations = async (req, res) => {
  try {
    const userGroups = await Group.find({ members: req.user.id });
    const groupIds = userGroups.map(group => group._id);
    
    const invitations = await Invitation.find({ 
      $or: [
        { sharedGroups: { $in: groupIds } },
        { invitedUsers: req.user.id }
      ]
    })
    .sort({ createdAt: -1 })
    .populate('host', 'name email')
    .populate('sharedGroups', 'name')
    .populate('invitedUsers', 'name email');

    const invitationIds = invitations.map(inv => inv._id);
    const receivedRecords = await ReceivedInvitation.find({ 
      invitation: { $in: invitationIds },
      recipient: req.user.id
    }).select('invitation isRead');

    const isReadMap = {};
    receivedRecords.forEach(rec => {
      isReadMap[rec.invitation.toString()] = rec.isRead;
    });

    const invitationsWithReadStatus = invitations.map(inv => ({
      ...inv.toObject(),
      isRead: isReadMap[inv._id.toString()] || false
    }));

    res.status(200).json({
      count: invitations.length,
      invitations: invitationsWithReadStatus
    });
  } catch (error) {
    console.error("Fetch Received Error:", error);
    res.status(500).json({ message: "Server error while fetching received invitations" });
  }
};

const updateInvitation = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, eventDate, location, videoUrl, googleMapsLink } = req.body;

    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to update this invitation" });
    }

    if (title) invitation.title = title;
    if (description) invitation.description = description;
    if (eventDate) invitation.eventDate = eventDate;
    if (location) invitation.location = location;
    if (videoUrl !== undefined) invitation.videoUrl = videoUrl || null;
    if (googleMapsLink !== undefined) invitation.googleMapsLink = googleMapsLink || null;

    if (req.file) {
      if (invitation.coverImage) {
        await deleteFromCloudinary(invitation.coverImage);
      }
      
      const uploadResult = await uploadOnCloudinary(req.file.path);
      invitation.coverImage = uploadResult?.url;
      
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }

    await invitation.save();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
      const guests = await ReceivedInvitation.find({ invitation: id }).populate('recipient', 'name email');
      
      for (const guest of guests) {
        if (guest.recipient && guest.recipient.email && !guest.recipient.email.includes('@placeholder.com')) {
          try {
            await sendEmail({
              to: guest.recipient.email,
              subject: `Event Updated: ${invitation.title}`,
              text: `Hello ${guest.recipient.name || 'Guest'},\n\nThe host has updated the details for "${invitation.title}".\n\nYou can view the updated event here: ${frontendUrl}/event/${invitation._id}\n\nBest regards,\nThe Event Team`
            });
          } catch (emailError) {
            console.error(`Failed to send update email to ${guest.recipient.email}:`, emailError);
          }
        }
      }
    } catch (notifyError) {
      console.error("Failed to send update notifications:", notifyError);
    }

    res.status(200).json(invitation);
  } catch (error) {
    console.error("Update Error:", error);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: "Server error while updating invitation" });
  }
};

const deleteInvitation = async (req, res) => {
  try {
    const { id } = req.params;

    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this invitation" });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
      const guests = await ReceivedInvitation.find({ invitation: id }).populate('recipient', 'name email');
      
      for (const guest of guests) {
        if (guest.recipient && guest.recipient.email && !guest.recipient.email.includes('@placeholder.com')) {
          try {
            await sendEmail({
              to: guest.recipient.email,
              subject: `Event Cancelled: ${invitation.title}`,
              text: `Hello ${guest.recipient.name || 'Guest'},\n\nWe regret to inform you that "${invitation.title}" has been cancelled by the host.\n\nWe apologize for any inconvenience.\n\nBest regards,\nThe Event Team`
            });
          } catch (emailError) {
            console.error(`Failed to send cancellation email to ${guest.recipient.email}:`, emailError);
          }
        }
      }
    } catch (notifyError) {
      console.error("Failed to send cancellation notifications:", notifyError);
    }

    if (invitation.coverImage) {
      await deleteFromCloudinary(invitation.coverImage);
    }

    await ReceivedInvitation.deleteMany({ invitation: id });
    await invitation.deleteOne();

    res.status(200).json({ message: "Invitation deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ message: "Server error while deleting invitation" });
  }
};

const getPublicInvitation = async (req, res) => {
  try {
    const { id } = req.params;

    const invitation = await Invitation.findById(id)
      .select('title eventDate coverImage location')
      .populate('host', 'name');

    if (!invitation) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json(invitation);
  } catch (error) {
    console.error("Public Glimpse Error:", error);
    res.status(500).json({ message: "Error fetching event" });
  }
};

const getTeaser = async (req, res) => {
  try {
    const { id } = req.params;

    const invitation = await Invitation.findById(id)
      .select('title coverImage eventDate')
      .populate('host', 'name');

    if (!invitation) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json(invitation);
  } catch (error) {
    console.error("Teaser Error:", error);
    res.status(500).json({ message: "Error fetching event teaser" });
  }
};

const revokeInvite = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, email, groupId } = req.body;

    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to revoke invitations" });
    }

    let userIdToRemove = userId;
    if (userId && typeof userId === 'string') {
      try {
        const mongoose = require('mongoose');
        userIdToRemove = new mongoose.Types.ObjectId(userId);
      } catch (e) {}
    }
    
    if (userIdToRemove) {
      await Invitation.findByIdAndUpdate(id, {
        $pull: { invitedUsers: userIdToRemove }
      });
      
      await ReceivedInvitation.deleteMany({
        invitation: id,
        recipient: userIdToRemove
      });
    }

    if (email) {
      const emailLower = email.toLowerCase().trim();
      await Invitation.findByIdAndUpdate(id, {
        $pull: { pendingGuestEmails: emailLower }
      });
    }

    if (groupId) {
      let groupIdToRemove = groupId;
      if (typeof groupId === 'string') {
        try {
          const mongoose = require('mongoose');
          groupIdToRemove = new mongoose.Types.ObjectId(groupId);
        } catch (e) {}
      }
      
      await Invitation.findByIdAndUpdate(id, {
        $pull: { sharedGroups: groupIdToRemove }
      });
    }

    const updatedInvitation = await Invitation.findById(id)
      .populate('host', 'name email')
      .populate('sharedGroups', 'name')
      .populate('invitedUsers', 'name email');
    
    const guestList = await ReceivedInvitation.find({ invitation: id })
      .populate('recipient', 'name email')
      .sort({ rsvpStatus: 1 });

    res.status(200).json({
      message: 'Invitation revoked successfully',
      invitation: {
        ...updatedInvitation.toObject(),
        guestList,
        pendingGuestEmails: updatedInvitation.pendingGuestEmails || []
      }
    });
  } catch (error) {
    console.error("Revoke Error:", error);
    res.status(500).json({ message: "Error revoking invitation" });
  }
};

const shareInvitationLater = async (req, res) => {
  try {
    const { id } = req.params;
    const { newGroups, newUsers, newEmails, newPhones, salutations } = req.body;

    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to share this invitation" });
    }

    let groupsArray = [];
    if (newGroups) {
      if (Array.isArray(newGroups)) {
        groupsArray = newGroups;
      } else if (typeof newGroups === 'string') {
        try {
          groupsArray = JSON.parse(newGroups);
        } catch (e) {
          groupsArray = newGroups.split(',').filter(g => g.trim());
        }
      }
    }

    const validUserIds = [];
    const rawEmails = [];
    const isObjectId = /^[0-9a-fA-F]{24}$/;
    
    // NEW LOGIC: Process Phones First and force them into validUserIds
    if (newPhones) {
      let phonesArray = [];
      if (Array.isArray(newPhones)) {
        phonesArray = newPhones;
      } else if (typeof newPhones === 'string') {
        try {
          phonesArray = JSON.parse(newPhones);
        } catch (e) {
          phonesArray = [];
        }
      }
      
      for (const p of phonesArray) {
        if (p.phone) {
          const cleanPhone = p.phone.replace(/[^0-9+]/g, ''); 
          
          // CRITICAL FIX: Match your Mongoose schema (phoneNumber)
          let user = await User.findOne({ phoneNumber: cleanPhone });
          
          if (!user) {
            try {
              user = await User.create({
                name: p.name || 'Guest',
                phoneNumber: cleanPhone,
                email: `guest_${cleanPhone}_${Date.now()}@placeholder.com`,
                isRegistered: false
              });
            } catch (err) {
              console.error('Failed to create placeholder for phone:', cleanPhone, err);
              continue; 
            }
          }
          validUserIds.push(user._id.toString());
        }
      }
    }

    if (newUsers) {
      let usersArray = [];
      if (Array.isArray(newUsers)) {
        usersArray = newUsers;
      } else if (typeof newUsers === 'string') {
        try {
          usersArray = JSON.parse(newUsers);
        } catch (e) {
          usersArray = newUsers.split(',').filter(u => u.trim());
        }
      }
      
      for (const item of usersArray) {
        if (isObjectId.test(item)) {
          validUserIds.push(item);
        } else if (item.includes('@')) {
          rawEmails.push(item.toLowerCase().trim());
        }
      }
    }

    if (newEmails) {
      let emailsArray = [];
      if (Array.isArray(newEmails)) {
        emailsArray = newEmails;
      } else if (typeof newEmails === 'string') {
        try {
          emailsArray = JSON.parse(newEmails);
        } catch (e) {
          emailsArray = newEmails.split(',').filter(e => e.trim());
        }
      }
      
      for (const email of emailsArray) {
        if (email.includes('@')) {
          rawEmails.push(email.toLowerCase().trim());
        }
      }
    }

    const hostUser = await User.findById(req.user.id).select('name');
    const hostName = hostUser?.name || 'Someone';

    if (groupsArray.length > 0) {
      await Invitation.findByIdAndUpdate(id, {
        $addToSet: { sharedGroups: { $each: groupsArray } }
      });
    }

    let registeredEmails = [];
    if (validUserIds.length > 0) {
      await Invitation.findByIdAndUpdate(id, {
        $addToSet: { invitedUsers: { $each: validUserIds } }
      });
      
      const registeredUsers = await User.find({ _id: { $in: validUserIds } }).select('email name');
      
      registeredEmails = registeredUsers
        .filter(u => u.email && !u.email.includes('@placeholder.com'))
        .map(u => u.email);
    }

    let unregisteredEmails = [];
    if (rawEmails.length > 0) {
      const existingUsers = await User.find({ email: { $in: rawEmails } }).select('email');
      const existingEmails = existingUsers.map(u => u.email.toLowerCase());
      
      const alreadyRegisteredIds = existingUsers.map(u => u._id.toString());
      unregisteredEmails = rawEmails.filter(e => !existingEmails.includes(e));
      
      if (alreadyRegisteredIds.length > 0) {
        await Invitation.findByIdAndUpdate(id, {
          $addToSet: { invitedUsers: { $each: alreadyRegisteredIds } }
        });
        registeredEmails = [...registeredEmails, ...existingEmails];
      }
      
      if (unregisteredEmails.length > 0) {
        await Invitation.findByIdAndUpdate(id, {
          $addToSet: { pendingGuestEmails: { $each: unregisteredEmails } }
        });
      }
    }

    const allNewRecipientIds = new Set();

    if (groupsArray.length > 0) {
      for (const groupId of groupsArray) {
        const group = await Group.findById(groupId);
        if (group) {
          group.members.forEach(memberId => {
            if (memberId.toString() !== req.user.id) {
              allNewRecipientIds.add(memberId.toString());
            }
          });
        }
      }
    }

    validUserIds.forEach(userId => {
      if (userId !== req.user.id) {
        allNewRecipientIds.add(userId);
      }
    });

    let salutationsMap = {};
    if (salutations) {
      if (typeof salutations === 'string') {
        try {
          salutationsMap = JSON.parse(salutations);
        } catch (e) {
          salutationsMap = {};
        }
      } else if (typeof salutations === 'object') {
        salutationsMap = salutations;
      }
    }

    if (allNewRecipientIds.size > 0) {
      const newRecipientIds = Array.from(allNewRecipientIds);
      
      await Promise.all(
        newRecipientIds.map(recipientId => {
          const salutation = salutationsMap[recipientId] || '';
          return ReceivedInvitation.findOneAndUpdate(
            { invitation: id, recipient: recipientId },
            { 
              $setOnInsert: { 
                invitation: id, 
                recipient: recipientId,
                rsvpStatus: 'tentative',
                salutation: salutation
              }
            },
            { upsert: true, new: true }
          );
        })
      );
    }

    const formatGreeting = (salutation, name) => {
      if (salutation) {
        return `Dear ${salutation} ${name || 'Guest'}`;
      }
      return `Hello ${name || 'Guest'}`;
    };

    for (const email of registeredEmails) {
      try {
        const user = await User.findOne({ email }).select('name');
        const userId = user?._id?.toString();
        const salutation = salutationsMap[userId] || salutationsMap[email] || '';
        const greeting = formatGreeting(salutation, user?.name);
        
        const emailBody = buildInvitationEmailBody(greeting, invitation, hostName, false);
        
        await sendEmail({
          to: email,
          subject: `You're invited: ${invitation.title}`,
          text: emailBody
        });
      } catch (emailError) {
        console.error(`Failed to send email to ${email}:`, emailError);
      }
    }

    for (const email of unregisteredEmails) {
      try {
        const salutation = salutationsMap[email] || '';
        const greeting = formatGreeting(salutation, '');
        
        const emailBody = buildInvitationEmailBody(greeting, invitation, hostName, true);
        
        await sendEmail({
          to: email,
          subject: `You've been invited to ${invitation.title}! (Action Required)`,
          text: emailBody
        });
      } catch (emailError) {
        console.error(`Failed to send email to ${email}:`, emailError);
      }
    }

    const updatedInvitation = await Invitation.findById(id)
      .populate('host', 'name email')
      .populate('sharedGroups', 'name')
      .populate('invitedUsers', 'name email');

    res.status(200).json({
      message: 'Invitations sent successfully',
      invitation: updatedInvitation
    });
  } catch (error) {
    console.error("Share Later Error:", error);
    res.status(500).json({ message: "Error sharing invitation" });
  }
};

const toggleSaveInvitation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    let received = await ReceivedInvitation.findOne({
      invitation: id,
      recipient: userId
    });

    if (!received) {
      received = await ReceivedInvitation.create({
        invitation: id,
        recipient: userId,
        rsvpStatus: 'tentative',
        isSaved: true
      });
      return res.status(200).json({ isSaved: true });
    }

    const newIsSaved = !received.isSaved;
    await ReceivedInvitation.updateOne(
      { _id: received._id },
      { isSaved: newIsSaved }
    );

    res.status(200).json({ isSaved: newIsSaved });
  } catch (error) {
    console.error("Toggle Save Error:", error);
    res.status(500).json({ message: "Error toggling save status" });
  }
};

const getSavedInvitations = async (req, res) => {
  try {
    const savedRecords = await ReceivedInvitation.find({ 
      recipient: req.user.id,
      isSaved: true
    })
    .populate({
      path: 'invitation',
      populate: [
        { path: 'host', select: 'name email' },
        { path: 'sharedGroups', select: 'name' }
      ]
    })
    .sort({ 'invitation.eventDate': 1 });

    const invitations = savedRecords
      .filter(record => record.invitation)
      .map(record => record.invitation);

    res.status(200).json({
      count: invitations.length,
      invitations
    });
  } catch (error) {
    console.error("Fetch Saved Error:", error);
    res.status(500).json({ message: "Error fetching saved invitations" });
  }
};

const getEventGuestList = async (req, res) => {
  try {
    const { id } = req.params;

    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to view this guest list" });
    }

    const guests = await ReceivedInvitation.find({ invitation: id })
      .populate('recipient', 'name email profileImage phoneNumber')
      .sort({ rsvpStatus: 1 });

    res.status(200).json({
      count: guests.length,
      guests
    });
  } catch (error) {
    console.error("Get Guest List Error:", error);
    res.status(500).json({ message: "Error fetching guest list" });
  }
};

const removeGuest = async (req, res) => {
  try {
    const { id, guestId } = req.params;

    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to remove guests" });
    }

    await ReceivedInvitation.deleteOne({
      invitation: id,
      recipient: guestId
    });

    await Invitation.findByIdAndUpdate(id, {
      $pull: { invitedUsers: guestId }
    });

    res.status(200).json({ message: "Guest removed successfully" });
  } catch (error) {
    console.error("Remove Guest Error:", error);
    res.status(500).json({ message: "Error removing guest" });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    await ReceivedInvitation.findOneAndUpdate(
      { invitation: id, recipient: req.user.id },
      { isRead: true }
    );

    res.status(200).json({ message: 'Marked as read' });
  } catch (error) {
    console.error("Mark as Read Error:", error);
    res.status(500).json({ message: "Error marking as read" });
  }
};

module.exports = { 
  createInvitation, 
  getInvitations,
  getInvitationById,
  updateRSVP,
  getReceivedInvitations, 
  updateInvitation, 
  deleteInvitation,
  getPublicInvitation,
  getTeaser,
  revokeInvite,
  shareInvitationLater,
  toggleSaveInvitation,
  getSavedInvitations,
  getEventGuestList,
  removeGuest,
  markAsRead
};