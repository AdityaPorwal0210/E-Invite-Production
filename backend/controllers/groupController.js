const Group = require("../models/Group");
const User = require("../models/User");
const ReceivedInvitation = require("../models/ReceivedInvitation");
const Invitation = require("../models/Invitation");
const sendEmail = require("../utils/sendEmail");
const fs = require('fs');
const { uploadOnCloudinary, deleteFromCloudinary } = require("../utils/cloudinary");

// Create a new group
const createGroup = async (req, res) => {
  try {
    const { name, description } = req.body;

    const group = await Group.create({
      name,
      description,
      owner: req.user.id,
      members: [req.user.id], // Owner is automatically a member
      admins: [req.user.id]  // Owner is also an admin
    });

    res.status(201).json(group);
  } catch (error) {
    console.error("Create Group Error:", error);
    res.status(500).json({ message: "Error creating group" });
  }
};

// Get all groups the user belongs to or owns
const getMyGroups = async (req, res) => {
  try {
    const groups = await Group.find({
      $or: [
        { owner: req.user.id },
        { members: req.user.id }
      ]
    })
    .populate('owner', 'name email')
    .populate('members', 'name email')
    .populate('admins', 'name email')
    .populate('joinRequests', 'name email')
    .sort({ createdAt: -1 });

    res.status(200).json(groups);
  } catch (error) {
    console.error("Get Groups Error:", error);
    res.status(500).json({ message: "Error fetching groups" });
  }
};

// Get a single group by ID
const getGroupById = async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id)
      .populate('owner', 'name email')
      .populate('members', 'name email')
      .populate('admins', 'name email')
      .populate('joinRequests', 'name email');

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    res.status(200).json(group);
  } catch (error) {
    console.error("Get Group Error:", error);
    res.status(500).json({ message: "Error fetching group" });
  }
};

// Get group info for public landing page (no sensitive data)
const getGroupInfoPublic = async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id)
      .select('name description joinSetting')
      .populate('owner', 'name')
      .populate('admins', 'name');

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    res.status(200).json({
      name: group.name,
      description: group.description,
      joinSetting: group.joinSetting,
      owner: group.owner?.name,
      admins: group.admins?.map(a => a.name) || []
    });
  } catch (error) {
    console.error("Get Public Group Error:", error);
    res.status(500).json({ message: "Error fetching group" });
  }
};

// Generate join link for a group
const generateJoinLink = async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Only owner can generate join link
    if (group.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only group owner can generate join link" });
    }

    const joinLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/group/join/${group._id}`;

    res.status(200).json({ 
      joinLink,
      groupId: group._id,
      groupName: group.name
    });
  } catch (error) {
    console.error("Generate Join Link Error:", error);
    res.status(500).json({ message: "Error generating join link" });
  }
};

// Request to join a group
const requestToJoin = async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check join setting
    if (group.joinSetting !== 'request_to_join') {
      return res.status(400).json({ message: "This group is invite-only" });
    }

    // Check if already a member
    if (group.members && group.members.includes(req.user.id)) {
      return res.status(400).json({ message: "You are already a member" });
    }

    // Check if already requested
    if (group.joinRequests && group.joinRequests.includes(req.user.id)) {
      return res.status(400).json({ message: "You have already requested to join" });
    }

    // Check if owner
    if (group.owner.toString() === req.user.id) {
      return res.status(400).json({ message: "You are the owner" });
    }

    // Use $addToSet to prevent duplicates
    await Group.findByIdAndUpdate(id, {
      $addToSet: { joinRequests: req.user.id }
    });

    res.status(200).json({ message: "Join request sent" });
  } catch (error) {
    console.error("Request Join Error:", error);
    res.status(500).json({ message: "Error requesting to join" });
  }
};

// Update group settings (join setting)
const updateGroupSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const { joinSetting } = req.body;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is admin
    const isAdmin = group.owner.toString() === req.user.id || 
                    (group.admins && group.admins.includes(req.user.id));
    
    if (!isAdmin) {
      return res.status(403).json({ message: "Only group admins can update settings" });
    }

    // Validate joinSetting
    if (!['invite_only', 'request_to_join'].includes(joinSetting)) {
      return res.status(400).json({ message: "Invalid join setting" });
    }

    group.joinSetting = joinSetting;
    await group.save();

    res.status(200).json({ joinSetting: group.joinSetting });
  } catch (error) {
    console.error("Update Settings Error:", error);
    res.status(500).json({ message: "Error updating group settings" });
  }
};

// Handle join request (approve or reject)
const handleJoinRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, status } = req.body;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is admin
    const isAdmin = group.owner.toString() === req.user.id || 
                    (group.admins && group.admins.includes(req.user.id));
    
    if (!isAdmin) {
      return res.status(403).json({ message: "Only group admins can handle requests" });
    }

    // Check if user is in joinRequests
    if (!group.joinRequests || !group.joinRequests.includes(userId)) {
      return res.status(400).json({ message: "No join request from this user" });
    }

    if (status === 'approve') {
      // Add to members, remove from joinRequests
      await Group.findByIdAndUpdate(id, {
        $addToSet: { members: userId },
        $pull: { joinRequests: userId }
      });
    } else if (status === 'reject') {
      // Just remove from joinRequests
      await Group.findByIdAndUpdate(id, {
        $pull: { joinRequests: userId }
      });
    } else {
      return res.status(400).json({ message: "Invalid status" });
    }

    const updatedGroup = await Group.findById(id)
      .populate('owner', 'name email')
      .populate('members', 'name email')
      .populate('admins', 'name email')
      .populate('joinRequests', 'name email');

    res.status(200).json(updatedGroup);
  } catch (error) {
    console.error("Handle Request Error:", error);
    res.status(500).json({ message: "Error handling join request" });
  }
};

// Approve a join request (owner only)
const approveRequest = async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Only owner can approve
    if (group.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only group owner can approve requests" });
    }

    // Check if user is in joinRequests
    if (!group.joinRequests.includes(userId)) {
      return res.status(400).json({ message: "No join request from this user" });
    }

    // Add to members, remove from joinRequests
    group.members.push(userId);
    group.joinRequests = group.joinRequests.filter(id => id.toString() !== userId);
    await group.save();

    res.status(200).json({ message: "User added to group" });
  } catch (error) {
    console.error("Approve Request Error:", error);
    res.status(500).json({ message: "Error approving request" });
  }
};

// Reject a join request (owner only)
const rejectRequest = async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Only owner can reject
    if (group.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only group owner can reject requests" });
    }

    // Remove from joinRequests
    group.joinRequests = group.joinRequests.filter(id => id.toString() !== userId);
    await group.save();

    res.status(200).json({ message: "Join request rejected" });
  } catch (error) {
    console.error("Reject Request Error:", error);
    res.status(500).json({ message: "Error rejecting request" });
  }
};

// Send invitation to group members
const sendInvitationToGroup = async (req, res) => {
  try {
    const { groupId, invitationId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Only owner can send invitations to group
    if (group.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only group owner can send invitations" });
    }

    const invitation = await Invitation.findById(invitationId);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    // Create ReceivedInvitation for each member (except owner who already has it)
    const memberIds = group.members.filter(id => id.toString() !== req.user.id);
    
    const receivedInvitations = await Promise.all(
      memberIds.map(memberId => 
        ReceivedInvitation.findOneAndUpdate(
          { invitation: invitationId, recipient: memberId },
          { 
            invitation: invitationId, 
            recipient: memberId,
            rsvpStatus: 'Pending'
          },
          { upsert: true, new: true }
        )
      )
    );

    res.status(200).json({ 
      message: `Invitation sent to ${receivedInvitations.length} members`,
      count: receivedInvitations.length
    });
  } catch (error) {
    console.error("Send to Group Error:", error);
    res.status(500).json({ message: "Error sending invitation to group" });
  }
};

// Leave a group
const leaveGroup = async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Owner cannot leave
    if (group.owner.toString() === req.user.id) {
      return res.status(400).json({ message: "Owner cannot leave group. Transfer ownership first." });
    }

    // Remove from members
    group.members = group.members.filter(id => id.toString() !== req.user.id);
    
    // Also remove from joinRequests if present
    group.joinRequests = group.joinRequests.filter(id => id.toString() !== req.user.id);
    
    await group.save();

    res.status(200).json({ message: "Left group successfully" });
  } catch (error) {
    console.error("Leave Group Error:", error);
    res.status(500).json({ message: "Error leaving group" });
  }
};

// Add member to group
const addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is admin (owner or in admins array)
    const isAdmin = group.owner.toString() === req.user.id || 
                    (group.admins && group.admins.includes(req.user.id));
    
    if (!isAdmin) {
      return res.status(403).json({ message: "Only group admins can add members" });
    }

    // Check if already a member
    if (group.members.includes(userId)) {
      return res.status(400).json({ message: "User is already a member" });
    }

    // Add member using $addToSet to prevent duplicates
    await Group.findByIdAndUpdate(id, {
      $addToSet: { members: userId }
    });

    // Send email notification to the new member
    try {
      const newMember = await User.findById(userId).select('email name');
      if (newMember && newMember.email) {
        await sendEmail({
          to: newMember.email,
          subject: `You've been added to ${group.name}`,
          text: `Hello ${newMember.name || 'User'},\n\nYou were added to the group "${group.name}" by ${req.user.name}.\n\nLog in to view your groups and upcoming events.\n\nBest regards,\nThe Event Team`
        });
      }
    } catch (emailError) {
      console.error("Failed to send group addition email:", emailError);
      // Don't fail the request if email fails
    }

    const updatedGroup = await Group.findById(id)
      .populate('owner', 'name email')
      .populate('members', 'name email')
      .populate('admins', 'name email')
      .populate('joinRequests', 'name email');

    res.status(200).json(updatedGroup);
  } catch (error) {
    console.error("Add Member Error:", error);
    res.status(500).json({ message: "Error adding member" });
  }
};

// Remove member from group
const removeMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is admin (owner or in admins array)
    const isAdmin = group.owner.toString() === req.user.id || 
                    (group.admins && group.admins.includes(req.user.id));
    
    if (!isAdmin) {
      return res.status(403).json({ message: "Only group admins can remove members" });
    }

    // Cannot remove owner
    if (group.owner.toString() === userId) {
      return res.status(400).json({ message: "Cannot remove group owner" });
    }

    // Remove member
    await Group.findByIdAndUpdate(id, {
      $pull: { members: userId, admins: userId }
    });

    const updatedGroup = await Group.findById(id)
      .populate('owner', 'name email')
      .populate('members', 'name email')
      .populate('admins', 'name email')
      .populate('joinRequests', 'name email');

    res.status(200).json(updatedGroup);
  } catch (error) {
    console.error("Remove Member Error:", error);
    res.status(500).json({ message: "Error removing member" });
  }
};

// Toggle admin status
const toggleAdminStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if requester is admin (owner or in admins array)
    const isAdmin = group.owner.toString() === req.user.id || 
                    (group.admins && group.admins.includes(req.user.id));
    
    if (!isAdmin) {
      return res.status(403).json({ message: "Only group admins can toggle admin status" });
    }

    // Cannot change owner's status
    if (group.owner.toString() === userId) {
      return res.status(400).json({ message: "Cannot change owner's admin status" });
    }

    // Check if user is already an admin
    const isTargetAdmin = group.admins && group.admins.includes(userId);

    if (isTargetAdmin) {
      // Remove from admins
      await Group.findByIdAndUpdate(id, {
        $pull: { admins: userId }
      });
    } else {
      // Add to admins
      await Group.findByIdAndUpdate(id, {
        $addToSet: { admins: userId }
      });
    }

    const updatedGroup = await Group.findById(id)
      .populate('owner', 'name email')
      .populate('members', 'name email')
      .populate('admins', 'name email')
      .populate('joinRequests', 'name email');

    res.status(200).json(updatedGroup);
  } catch (error) {
    console.error("Toggle Admin Error:", error);
    res.status(500).json({ message: "Error toggling admin status" });
  }
};

// Delete group
const deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Only owner can delete group
    if (group.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only group owner can delete group" });
    }

    await Group.findByIdAndDelete(id);

    res.status(200).json({ message: "Group deleted successfully" });
  } catch (error) {
    console.error("Delete Group Error:", error);
    res.status(500).json({ message: "Error deleting group" });
  }
};

// Update group (name, description, groupImage)
const updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, groupImage } = req.body;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is admin
    const isAdmin = group.owner.toString() === req.user.id || 
                    (group.admins && group.admins.includes(req.user.id));
    
    if (!isAdmin) {
      return res.status(403).json({ message: "Only group admins can update group" });
    }

    // Build update object
    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (groupImage !== undefined) group.groupImage = groupImage;

    await group.save();

    const updatedGroup = await Group.findById(id)
      .populate('owner', 'name email')
      .populate('members', 'name email')
      .populate('admins', 'name email')
      .populate('joinRequests', 'name email');

    res.status(200).json(updatedGroup);
  } catch (error) {
    console.error("Update Group Error:", error);
    res.status(500).json({ message: "Error updating group" });
  }
};

module.exports = {
  createGroup,
  getMyGroups,
  getGroupById,
  getGroupInfoPublic,
  generateJoinLink,
  requestToJoin,
  updateGroupSettings,
  handleJoinRequest,
  approveRequest,
  rejectRequest,
  sendInvitationToGroup,
  leaveGroup,
  addMember,
  removeMember,
  toggleAdminStatus,
  deleteGroup,
  updateGroup
};
