const Invitation = require("../models/Invitation");
const Group = require("../models/Group");
const User = require("../models/User");
const ReceivedInvitation = require("../models/ReceivedInvitation");
const { uploadOnCloudinary, deleteFromCloudinary } = require("../utils/cloudinary");
const sendEmail = require("../utils/sendEmail");
const fs = require('fs');

const createInvitation = async (req, res) => {
  try {
    const { title, description, eventDate, location, sharedGroups, invitedUsers, invitedEmails, videoUrl, googleMapsLink } = req.body;

    // Parse sharedGroups if it's a string (from FormData)
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

    // Parse invitedUsers if it's a string (from FormData)
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

    // Parse invitedEmails (for unregistered users)
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
    
    // Handle single cover image (backward compatibility)
    if (req.files && req.files.length > 0) {
      // First file is cover image if it's an image
      const firstFile = req.files[0];
      if (firstFile.mimetype.startsWith('image/')) {
        const uploadResult = await uploadOnCloudinary(firstFile.path);
        coverImageUrl = uploadResult?.url;
        
        if (fs.existsSync(firstFile.path)) {
          fs.unlinkSync(firstFile.path);
        }
      }
      
      // Process all files as attachments
      for (const file of req.files) {
        const uploadResult = await uploadOnCloudinary(file.path);
        if (uploadResult?.url) {
          attachments.push({
            url: uploadResult.url,
            fileType: file.mimetype,
            name: file.originalname
          });
        }
        
        // Clean up local file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    // Handle email invitations - separate registered vs unregistered
    let registeredIds = [];
    let unregisteredEmails = [];
    
    if (emailsArray.length > 0) {
      // Query DB for existing users with these emails
      const existingUsers = await User.find({ email: { $in: emailsArray } }).select('_id email');
      const foundEmails = existingUsers.map(u => u.email.toLowerCase());
      
      // Separate into registered and unregistered
      registeredIds = existingUsers.map(u => u._id.toString());
      unregisteredEmails = emailsArray.filter(e => !foundEmails.includes(e.toLowerCase()));
      
      // Add registered users to usersArray
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

    // Get all unique recipient IDs (from groups + individual users)
    const allRecipientIds = new Set();
    
    // Add group members
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
    
    // Add individually invited users
    if (usersArray.length > 0) {
      usersArray.forEach(userId => {
        if (userId.toString() !== req.user.id) {
          allRecipientIds.add(userId.toString());
        }
      });
    }

    // Get host name for emails
    const hostUser = await User.findById(req.user.id).select('name');
    const hostName = hostUser?.name || 'Someone';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Create ReceivedInvitation for each unique registered recipient
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
      
      // Send email invitations to all registered recipients
      const recipientUsers = await User.find({ _id: { $in: recipientIds } }).select('email name');
      
      // Send emails to each registered recipient
      for (const recipient of recipientUsers) {
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

    // Send emails to unregistered guests (Teaser Email - hides location)
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
    // Only fetch invitations owned by the current user
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

// Get single invitation by ID
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

    // Check if user owns this invitation
    const isHost = invitation.user.toString() === req.user.id;

    // If host, include guest list
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

    // Check if user is in pendingGuestEmails (unregistered guest)
    const pendingEmails = invitation.pendingGuestEmails || [];
    const isPendingGuest = userEmail && pendingEmails.includes(userEmail);

    // For non-hosts, check if they have a ReceivedInvitation
    const received = await ReceivedInvitation.findOne({ 
      invitation: id, 
      recipient: req.user.id 
    }).select('rsvpStatus salutation isSaved isRead');

    // If user was a pending guest but now has an account, claim the invite
    if (isPendingGuest && !received) {
      // Add user to invitedUsers and remove from pendingGuestEmails
      await Invitation.findByIdAndUpdate(id, {
        $addToSet: { invitedUsers: req.user.id },
        $pull: { pendingGuestEmails: userEmail }
      });
      
      // Create ReceivedInvitation record
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

// Update RSVP status
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

    // Use updateOne to bypass validation issues with old data
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

// Get invitations sent to user's groups or directly invited (Inbox)
const getReceivedInvitations = async (req, res) => {
  try {
    // Find all groups where user is a member
    const userGroups = await Group.find({ members: req.user.id });
    const groupIds = userGroups.map(group => group._id);
    
    // Find all invitations where:
    // - sharedGroups contains any of the user's group IDs, OR
    // - invitedUsers contains the current user's ID
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

    // Get isRead status for each invitation
    const invitationIds = invitations.map(inv => inv._id);
    const receivedRecords = await ReceivedInvitation.find({ 
      invitation: { $in: invitationIds },
      recipient: req.user.id
    }).select('invitation isRead');

    const isReadMap = {};
    receivedRecords.forEach(rec => {
      isReadMap[rec.invitation.toString()] = rec.isRead;
    });

    // Add isRead to each invitation
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

    // Check ownership
    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to update this invitation" });
    }

    // Update fields
    if (title) invitation.title = title;
    if (description) invitation.description = description;
    if (eventDate) invitation.eventDate = eventDate;
    if (location) invitation.location = location;
    if (videoUrl !== undefined) invitation.videoUrl = videoUrl || null;
    if (googleMapsLink !== undefined) invitation.googleMapsLink = googleMapsLink || null;

    // Handle cover image upload
    if (req.file) {
      // Delete old image if exists
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

    // Check ownership
    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this invitation" });
    }

    // Delete cover image from Cloudinary
    if (invitation.coverImage) {
      await deleteFromCloudinary(invitation.coverImage);
    }

    // Delete any received invitations
    await ReceivedInvitation.deleteMany({ invitation: id });

    await invitation.deleteOne();

    res.status(200).json({ message: "Invitation deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ message: "Server error while deleting invitation" });
  }
};

// Public glimpse - only returns basic event info, no private details
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

// Public teaser - ONLY returns title, coverImage, eventDate, host name (no location, video, description, guest list)
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

// Revoke an invitation (host can remove guests, groups, or pending emails)
const revokeInvite = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, email, groupId } = req.body;

    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    // Check ownership
    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to revoke invitations" });
    }

    // Handle userId removal (registered user)
    // Convert to ObjectId if string
    let userIdToRemove = userId;
    if (userId && typeof userId === 'string') {
      try {
        const mongoose = require('mongoose');
        userIdToRemove = new mongoose.Types.ObjectId(userId);
      } catch (e) {
        // Keep as string if not valid ObjectId
      }
    }
    
    if (userIdToRemove) {
      // Remove from invitedUsers array (supports both string and ObjectId)
      await Invitation.findByIdAndUpdate(id, {
        $pull: { 
          invitedUsers: userIdToRemove
        }
      });
      
      // Also remove from ReceivedInvitation collection
      await ReceivedInvitation.deleteMany({
        invitation: id,
        recipient: userIdToRemove
      });
    }

    // Handle email removal (unregistered guest)
    if (email) {
      const emailLower = email.toLowerCase().trim();
      await Invitation.findByIdAndUpdate(id, {
        $pull: { pendingGuestEmails: emailLower }
      });
    }

    // Handle groupId removal (shared group)
    if (groupId) {
      // Convert to ObjectId if string
      let groupIdToRemove = groupId;
      if (typeof groupId === 'string') {
        try {
          const mongoose = require('mongoose');
          groupIdToRemove = new mongoose.Types.ObjectId(groupId);
        } catch (e) {
          // Keep as string
        }
      }
      
      await Invitation.findByIdAndUpdate(id, {
        $pull: { sharedGroups: groupIdToRemove }
      });
    }

    // Fetch updated invitation with guest list
    const updatedInvitation = await Invitation.findById(id)
      .populate('host', 'name email')
      .populate('sharedGroups', 'name')
      .populate('invitedUsers', 'name email');
    
    // Get updated guest list from ReceivedInvitation
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

// Share invitation with more groups/users after creation
const shareInvitationLater = async (req, res) => {
  try {
    const { id } = req.params;
    const { newGroups, newUsers, newEmails, salutations } = req.body;

    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    // Check ownership
    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to share this invitation" });
    }

    // Parse newGroups
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

    // Separate newUsers into valid ObjectIds and raw emails
    const validUserIds = [];
    const rawEmails = [];
    const isObjectId = /^[0-9a-fA-F]{24}$/;
    
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
      
      // Separate ObjectIds from emails
      for (const item of usersArray) {
        if (isObjectId.test(item)) {
          validUserIds.push(item);
        } else if (item.includes('@')) {
          rawEmails.push(item.toLowerCase().trim());
        }
      }
    }

    // Also process newEmails if provided directly
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

    // Get host name
    const hostUser = await User.findById(req.user.id).select('name');
    const hostName = hostUser?.name || 'Someone';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Handle group invitations
    if (groupsArray.length > 0) {
      await Invitation.findByIdAndUpdate(id, {
        $addToSet: { sharedGroups: { $each: groupsArray } }
      });
    }

    // Handle registered user invitations (valid ObjectIds only)
    let registeredEmails = [];
    if (validUserIds.length > 0) {
      // Only use valid ObjectIds in the query
      await Invitation.findByIdAndUpdate(id, {
        $addToSet: { invitedUsers: { $each: validUserIds } }
      });
      
      // Get emails of registered users to send invitations
      const registeredUsers = await User.find({ _id: { $in: validUserIds } }).select('email name');
      registeredEmails = registeredUsers.map(u => u.email);
    }

    // Handle unregistered guest invitations (raw emails)
    let unregisteredEmails = [];
    if (rawEmails.length > 0) {
      // Check which emails are already registered
      const existingUsers = await User.find({ email: { $in: rawEmails } }).select('email');
      const existingEmails = existingUsers.map(u => u.email.toLowerCase());
      
      // Separate into already registered vs truly unregistered
      const alreadyRegisteredIds = existingUsers.map(u => u._id.toString());
      unregisteredEmails = rawEmails.filter(e => !existingEmails.includes(e));
      
      // Add already registered users to invitedUsers
      if (alreadyRegisteredIds.length > 0) {
        await Invitation.findByIdAndUpdate(id, {
          $addToSet: { invitedUsers: { $each: alreadyRegisteredIds } }
        });
        registeredEmails = [...registeredEmails, ...existingEmails];
      }
      
      // Add unregistered emails to pendingGuestEmails
      if (unregisteredEmails.length > 0) {
        await Invitation.findByIdAndUpdate(id, {
          $addToSet: { pendingGuestEmails: { $each: unregisteredEmails } }
        });
      }
    }

    // Get all unique new recipient IDs from groups
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

    // Add registered user IDs
    validUserIds.forEach(userId => {
      if (userId !== req.user.id) {
        allNewRecipientIds.add(userId);
      }
    });

    // Create ReceivedInvitation for new registered recipients with salutations
    if (allNewRecipientIds.size > 0) {
      const newRecipientIds = Array.from(allNewRecipientIds);
      
      // Parse salutations if provided (format: { "userId": "Mr.", "email": "Mrs." })
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

    // Parse salutations for emails
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

    // Helper to format greeting with salutation
    const formatGreeting = (salutation, name) => {
      if (salutation) {
        return `Dear ${salutation} ${name || 'Guest'}`;
      }
      return `Hello ${name || 'Guest'}`;
    };

    // Send emails to registered guests (standard invitation)
    for (const email of registeredEmails) {
      try {
        // Find user to get their name and check for salutation
        const user = await User.findOne({ email }).select('name');
        const userId = user?._id?.toString();
        const salutation = salutationsMap[userId] || salutationsMap[email] || '';
        const greeting = formatGreeting(salutation, user?.name);
        
        await sendEmail({
          to: email,
          subject: `You're invited: ${invitation.title}`,
          text: `${greeting},\n\nYou have been invited to "${invitation.title}" by ${hostName}.\n\nEvent Details:\n- Date: ${new Date(invitation.eventDate).toLocaleDateString()}\n- Location: ${invitation.location}\n\nClick here to view and RSVP: ${frontendUrl}/invitation/${invitation._id}\n\nBest regards,\nThe Event Team`
        });
      } catch (emailError) {
        console.error(`Failed to send email to ${email}:`, emailError);
      }
    }

    // Send teaser emails to unregistered guests (hides location)
    for (const email of unregisteredEmails) {
      try {
        const salutation = salutationsMap[email] || '';
        const greeting = formatGreeting(salutation, '');
        
        await sendEmail({
          to: email,
          subject: `You've been invited to ${invitation.title}! (Action Required)`,
          text: `${greeting},\n\nYou have been invited to "${invitation.title}" by ${hostName} on ${new Date(invitation.eventDate).toLocaleDateString()}.\n\n📍 Location: (signup to see)\n\nTo unlock the full details, view the location, and RSVP, please create a free account:\n\n${frontendUrl}/invitation/${invitation._id}\n\nBest regards,\nThe Event Team`
        });
      } catch (emailError) {
        console.error(`Failed to send email to ${email}:`, emailError);
      }
    }

    // Fetch updated invitation
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

// Toggle "Save the Date" for a guest
const toggleSaveInvitation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if invitation exists
    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    // Find or create the ReceivedInvitation record (make it fault-tolerant)
    let received = await ReceivedInvitation.findOne({
      invitation: id,
      recipient: userId
    });

    // If no record exists, create one (allows saving even if not directly invited)
    if (!received) {
      received = await ReceivedInvitation.create({
        invitation: id,
        recipient: userId,
        rsvpStatus: 'tentative',
        isSaved: true
      });
      return res.status(200).json({ isSaved: true });
    }

    // Toggle isSaved using updateOne to bypass validation on existing records with old 'Pending' status
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

// Get all saved invitations for the current user
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

    // Filter out any null invitations (deleted events)
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

// Get guest list for a specific event (host only)
const getEventGuestList = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the invitation
    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    // Security check: Ensure user is the host
    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to view this guest list" });
    }

    // Get all received invitations for this event
    const guests = await ReceivedInvitation.find({ invitation: id })
      .populate('recipient', 'name email profileImage')
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

// Remove a guest from an event (host only)
const removeGuest = async (req, res) => {
  try {
    const { id } = req.params;
    const { guestId } = req.body;

    const invitation = await Invitation.findById(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    // Security check: Ensure user is the host
    if (invitation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to remove guests" });
    }

    // Remove guest from ReceivedInvitation
    await ReceivedInvitation.deleteOne({
      invitation: id,
      recipient: guestId
    });

    // Remove from invitedUsers
    await Invitation.findByIdAndUpdate(id, {
      $pull: { invitedUsers: guestId }
    });

    res.status(200).json({ message: "Guest removed successfully" });
  } catch (error) {
    console.error("Remove Guest Error:", error);
    res.status(500).json({ message: "Error removing guest" });
  }
};

// Mark an invitation as read
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
