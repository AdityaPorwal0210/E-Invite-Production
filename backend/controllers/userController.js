const User = require("../models/User");
const Invitation = require("../models/Invitation");
const ReceivedInvitation = require("../models/ReceivedInvitation");
const Group = require("../models/Group");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const sendEmail = require("../utils/sendEmail");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT Helper Function
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// @desc    Register a new user
// @route   POST /api/users/register
const registerUser = async (req, res) => {
  try {
    const { name, email, password, phoneNumber } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Please include all required fields" });
    }

    const cleanEmail = email.toLowerCase().trim();
    let cleanPhone = null;
    if (phoneNumber) {
      cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
    }

    const existingActiveUser = await User.findOne({ email: cleanEmail, isRegistered: true });
    if (existingActiveUser) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

    let user;
    let isRecycled = false;

    let placeholderUser = await User.findOne({ email: cleanEmail, isRegistered: false });

    if (!placeholderUser && cleanPhone) {
      placeholderUser = await User.findOne({ phoneNumber: cleanPhone, isRegistered: false });
    }

    if (placeholderUser) {
      placeholderUser.name = name;
      placeholderUser.email = cleanEmail;
      placeholderUser.password = hashedPassword;
      if (cleanPhone) placeholderUser.phoneNumber = cleanPhone;
      placeholderUser.otp = otp;
      placeholderUser.otpExpires = otpExpires;
      placeholderUser.isVerified = false; 
      placeholderUser.isRegistered = true; 
      
      user = await placeholderUser.save();
      isRecycled = true;
    }

    if (!isRecycled) {
      user = await User.create({
        name,
        email: cleanEmail,
        password: hashedPassword,
        phoneNumber: cleanPhone,
        otp,
        otpExpires,
        isVerified: false,
        isRegistered: true 
      });
    }

    try {
      await sendEmail({
        to: cleanEmail,
        subject: 'Your Verification Code',
        text: `Your OTP is: ${otp}. It expires in 15 minutes.`
      });
    } catch (emailError) {
      console.error("Failed to send OTP email:", emailError);
    }

    res.status(201).json({
      message: 'OTP sent to email',
      email: user.email,
      requiresOTP: true
    });

  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
};

// @desc    Authenticate a user
// @route   POST /api/users/login
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res.status(403).json({ 
        message: 'Please verify your email first', 
        requiresOTP: true, 
        email: user.email 
      });
    }

    if (await bcrypt.compare(password, user.password)) {
      res.status(201).json({
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          profileImage: user.profileImage || '',
          isPhoneVerified: user.isPhoneVerified || false
        },
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};

// @desc    Verify OTP and complete registration
// @route   POST /api/users/verify-otp
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email });

    if (!user || user.otp !== otp || user.otpExpires < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    await User.updateOne(
      { _id: user._id },
      { 
        $set: { isVerified: true },
        $unset: { otp: 1, otpExpires: 1 } 
      }
    );
    
    const pendingInvitations = await Invitation.find({ 
      pendingGuestEmails: email.toLowerCase() 
    });
    
    for (const invite of pendingInvitations) {
      await Invitation.findByIdAndUpdate(invite._id, {
        $addToSet: { invitedUsers: user._id },
        $pull: { pendingGuestEmails: email.toLowerCase() }
      });
      
      await ReceivedInvitation.findOneAndUpdate(
        { invitation: invite._id, recipient: user._id },
        { 
          invitation: invite._id, 
          recipient: user._id,
          rsvpStatus: 'tentative'
        },
        { upsert: true, new: true }
      );
    }

    const updatedUser = await User.findById(user._id).select('-password');

    res.status(200).json({
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber
      },
      token: generateToken(updatedUser._id)
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({ message: "Server error during OTP verification" });
  }
};

// @desc    Search users by name or email
// @route   GET /api/users/search
const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: "Search query is required" });

    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ],
      _id: { $ne: req.user.id }
    })
    .select('-password')
    .limit(10);

    res.status(200).json(users);
  } catch (error) {
    console.error("Search Error:", error);
    res.status(500).json({ message: "Server error during search" });
  }
};

// @desc    Delete user account
const deleteUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email?.toLowerCase();

    const hostedEvents = await Invitation.find({ host: userId });
    for (const event of hostedEvents) {
      await ReceivedInvitation.deleteMany({ invitation: event._id });
    }
    await Invitation.deleteMany({ host: userId });
    await ReceivedInvitation.deleteMany({ recipient: userId });
    await Group.updateMany({ members: userId }, { $pull: { members: userId, admins: userId } });
    await User.findByIdAndDelete(userId);

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting account" });
  }
};

// @desc    Update user profile
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phoneNumber, profileImage } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (profileImage !== undefined) updateData.profileImage = profileImage;

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password');
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Error updating profile" });
  }
};

// @desc    Forgot Password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ message: "If an account exists, an OTP has been sent" });

    const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordOtp = resetOtp;
    user.resetPasswordOtpExpire = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await sendEmail({ to: email, subject: 'Password Reset OTP', text: `Your OTP is: ${resetOtp}` });
    res.status(200).json({ message: "If an account exists, an OTP has been sent" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Reset Password
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user || user.resetPasswordOtp !== otp || user.resetPasswordOtpExpire < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpire = undefined;
    await user.save();
    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Google Sign-In
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;
    const cleanEmail = email.toLowerCase().trim();

    let user = await User.findOne({ email: cleanEmail, isRegistered: true });
    if (user) {
      return res.status(200).json({
        user: { _id: user._id, name: user.name, email: user.email, phoneNumber: user.phoneNumber, profileImage: user.profileImage || picture || '' },
        token: generateToken(user._id)
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(Math.random().toString(36), salt);
    user = await User.findOneAndUpdate(
      { email: cleanEmail },
      { name, password: hashedPassword, profileImage: picture, isRegistered: true, isVerified: true },
      { upsert: true, new: true }
    );

    res.status(200).json({ user, token: generateToken(user._id) });
  } catch (error) {
    res.status(500).json({ message: "Google login failed" });
  }
};

// @desc    Get notification counts
const getNotificationCounts = async (req, res) => {
  try {
    const userId = req.user.id;
    const pendingInvites = await ReceivedInvitation.countDocuments({ recipient: userId, isRead: false });
    const adminGroups = await Group.find({ admins: userId });
    const pendingGroupRequests = adminGroups.reduce((total, g) => total + (g.joinRequests?.length || 0), 0);
    res.status(200).json({ pendingInvites, pendingGroupRequests });
  } catch (error) {
    res.status(500).json({ message: "Error fetching counts" });
  }
};

// IDENTITY SYNC LOGIC
const requestPhoneSync = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ message: "Phone number is required" });
    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');

    const existingActiveUser = await User.findOne({ phoneNumber: cleanPhone, isPhoneVerified: true, _id: { $ne: userId } });
    if (existingActiveUser) return res.status(400).json({ message: "Phone number already linked." });

    const user = await User.findById(userId);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.phoneOtp = otp;
    user.phoneOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.phoneNumber = cleanPhone;
    await user.save();

    console.log(`\n📲 SIMULATED SMS TO ${cleanPhone}: Your code is ${otp}\n`);
    res.status(200).json({ message: "OTP sent to phone number", requiresOTP: true });
  } catch (error) {
    res.status(500).json({ message: "Error requesting sync" });
  }
};

const verifyPhoneSync  = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    const userId = req.user.id;

    if (otp !== '123456') { // HARDCODED FOR TESTING
      return res.status(400).json({ message: "Invalid OTP code." });
    }

    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');

    // 1. Merge Placeholder User
    const placeholderUser = await User.findOne({ phoneNumber: cleanPhone, isRegistered: false });
    if (placeholderUser) {
      await ReceivedInvitation.updateMany({ recipient: placeholderUser._id }, { recipient: userId });
      await placeholderUser.deleteOne();
    }

    // 2. Merge Invitations sent to this phone number
    const inviteUpdate = await ReceivedInvitation.updateMany(
      { phoneNumber: cleanPhone, recipient: { $exists: false } },
      { recipient: userId }
    );

    // 3. Merge Groups
    const groupUpdate = await Group.updateMany(
      { "pendingMembers.phoneNumber": cleanPhone },
      { 
        $addToSet: { members: userId },
        $pull: { pendingMembers: { phoneNumber: cleanPhone } }
      }
    );

    await User.findByIdAndUpdate(userId, { phoneNumber: cleanPhone, isPhoneVerified: true });

    res.status(200).json({ 
      message: "Sync complete!", 
      invitesLinked: inviteUpdate.modifiedCount,
      groupsJoined: groupUpdate.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ message: "Sync failed" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  verifyOTP,
  searchUsers,
  deleteUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
  getNotificationCounts,
  googleLogin,
  requestPhoneSync,
  verifyPhoneAndSync
};