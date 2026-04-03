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

    // 1. Validate Input
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Please include all required fields" });
    }

    const cleanEmail = email.toLowerCase().trim();
    let cleanPhone = null;
    if (phoneNumber) {
      cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
    }

    // 2. Check if a REAL, active user already exists with this email
    const existingActiveUser = await User.findOne({ email: cleanEmail, isRegistered: true });
    if (existingActiveUser) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    // 3. Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    let user;
    let isRecycled = false;

    // 5. THE DUAL-RECYCLE PROTOCOL (Identity Resolution)
    
    // Check A: Does a dummy account exist for this EMAIL?
    let placeholderUser = await User.findOne({ email: cleanEmail, isRegistered: false });

    // Check B: If not email, does a dummy account exist for this PHONE?
    if (!placeholderUser && cleanPhone) {
      placeholderUser = await User.findOne({ phoneNumber: cleanPhone, isRegistered: false });
    }

    // If we found a placeholder (either by email or phone), recycle it!
    if (placeholderUser) {
      console.log(`♻️ Recycling placeholder account. Found by: ${placeholderUser.email === cleanEmail ? 'Email' : 'Phone'}`);
      
      placeholderUser.name = name;
      placeholderUser.email = cleanEmail;
      placeholderUser.password = hashedPassword;
      if (cleanPhone) placeholderUser.phoneNumber = cleanPhone; // Ensure we save the phone
      placeholderUser.otp = otp;
      placeholderUser.otpExpires = otpExpires;
      placeholderUser.isVerified = false; 
      placeholderUser.isRegistered = true; // Upgrade to real user
      
      user = await placeholderUser.save();
      isRecycled = true;
    }

    // 6. Create New User (If no placeholder was found at all)
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

    // 7. Send OTP via email
    try {
      await sendEmail({
        to: cleanEmail,
        subject: 'Your Verification Code',
        text: `Your OTP is: ${otp}. It expires in 15 minutes.`
      });
    } catch (emailError) {
      console.error("Failed to send OTP email:", emailError);
    }

    // 8. Return success with OTP required
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

    // 1. Find user by email
    const user = await User.findOne({ email });

    // 2. Check if user exists
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // 3. Check if user is verified
    if (!user.isVerified) {
      return res.status(403).json({ 
        message: 'Please verify your email first', 
        requiresOTP: true, 
        email: user.email 
      });
    }

    // 4. Check password against hashed password in DB
    if (await bcrypt.compare(password, user.password)) {
      res.status(201).json({
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          profileImage: user.profileImage || ''
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

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // Check if OTP matches and not expired
    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.otpExpires < new Date()) {
      return res.status(400).json({ message: "OTP has expired. Please register again." });
    }

    // Verify user and clear OTP fields
    await User.updateOne(
      { _id: user._id },
      { 
        $set: { isVerified: true },
        $unset: { otp: 1, otpExpires: 1 } 
      }
    );

    // CLAIM PENDING INVITATIONS
    // Find all invitations where this email is in pendingGuestEmails
    const Invitation = require("../models/Invitation");
    const ReceivedInvitation = require("../models/ReceivedInvitation");
    
    const pendingInvitations = await Invitation.find({ 
      pendingGuestEmails: email.toLowerCase() 
    });
    
    // For each pending invitation, add user to invitedUsers and create ReceivedInvitation
    for (const invite of pendingInvitations) {
      await Invitation.findByIdAndUpdate(invite._id, {
        $addToSet: { invitedUsers: user._id },
        $pull: { pendingGuestEmails: email.toLowerCase() }
      });
      
      // Create ReceivedInvitation record
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

    // Fetch updated user
    const updatedUser = await User.findById(user._id).select('-password');

    // Generate and return token
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
    
    if (!query) {
      return res.status(400).json({ message: "Search query is required" });
    }

    // Search by name or email (case-insensitive)
    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ],
      _id: { $ne: req.user.id } // Exclude current user
    })
    .select('-password') // Exclude password
    .limit(10);

    res.status(200).json(users);
  } catch (error) {
    console.error("Search Error:", error);
    res.status(500).json({ message: "Server error during search" });
  }
};

// @desc    Delete user account with cascade cleanup
// @route   DELETE /api/users/profile
const deleteUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email?.toLowerCase();

    // 1. Delete all events hosted by this user
    const hostedEvents = await Invitation.find({ host: userId });
    for (const event of hostedEvents) {
      // Delete cover images from Cloudinary
      if (event.coverImage) {
        const { deleteFromCloudinary } = require("../utils/cloudinary");
        try {
          await deleteFromCloudinary(event.coverImage);
        } catch (e) {
          console.error("Failed to delete cover image:", e);
        }
      }
      // Delete ReceivedInvitation records for this event
      await ReceivedInvitation.deleteMany({ invitation: event._id });
    }
    await Invitation.deleteMany({ host: userId });

    // 2. Remove user from other events' guest lists
    await Invitation.updateMany(
      { 'guestList.recipient': userId },
      { $pull: { guestList: { recipient: userId }, invitedUsers: userId } }
    );
    await Invitation.updateMany(
      { invitedUsers: userId },
      { $pull: { invitedUsers: userId } }
    );

    // 3. Remove ReceivedInvitation records where user is recipient
    await ReceivedInvitation.deleteMany({ recipient: userId });

    // 4. Remove user's email from pendingGuestEmails
    if (userEmail) {
      await Invitation.updateMany(
        { pendingGuestEmails: userEmail },
        { $pull: { pendingGuestEmails: userEmail } }
      );
    }

    // 5. Remove user from groups they were member of
    await Group.updateMany(
      { members: userId },
      { $pull: { members: userId, admins: userId } }
    );

    // 6. Delete the user
    await User.findByIdAndDelete(userId);

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete Profile Error:", error);
    res.status(500).json({ message: "Error deleting account" });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phoneNumber, profileImage } = req.body;

    // Build update object
    const updateData = {};
    if (name) updateData.name = name;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (profileImage !== undefined) updateData.profileImage = profileImage;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password');

    res.status(200).json(user);
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ message: "Error updating profile" });
  }
};

// @desc    Forgot Password - send reset OTP
// @route   POST /api/users/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });

    // Don't reveal if user exists or not
    if (!user) {
      return res.status(200).json({ message: "If an account exists, an OTP has been sent" });
    }

    // Generate 6-digit OTP
    const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const resetOtpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    user.resetPasswordOtp = resetOtp;
    user.resetPasswordOtpExpire = resetOtpExpires;
    await user.save();

    // Send email with OTP
    try {
      await sendEmail({
        to: email,
        subject: 'Password Reset OTP',
        text: `Your password reset OTP is: ${resetOtp}. It expires in 15 minutes.`
      });
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
      return res.status(500).json({ message: "Failed to send reset email" });
    }

    res.status(200).json({ message: "If an account exists, an OTP has been sent" });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Reset Password with OTP
// @route   POST /api/users/reset-password
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP, and new password are required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid request" });
    }

    // Verify OTP
    if (user.resetPasswordOtp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Check expiry
    if (!user.resetPasswordOtpExpire || user.resetPasswordOtpExpire < new Date()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear OTP fields
    user.password = hashedPassword;
    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpire = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Google Sign-In
// @route   POST /api/users/google-login
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "ID token is required" });
    }

    // Verify the ID token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;
    const cleanEmail = email.toLowerCase().trim();

    // 1. Check if a FULLY REGISTERED user already exists
    let user = await User.findOne({ email: cleanEmail, isRegistered: true });

    if (user) {
      // Standard Login Flow
      return res.status(200).json({
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          profileImage: user.profileImage || picture || ''
        },
        token: generateToken(user._id)
      });
    }

    // 2. THE RECYCLE PROTOCOL (Email Placeholders Only)
    let placeholderUser = await User.findOne({ email: cleanEmail, isRegistered: false });

    // Generate the dummy password for the schema requirement
    const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(randomPassword, salt);

    if (placeholderUser) {
      console.log(`♻️ Recycling EMAIL placeholder account for Google user: ${cleanEmail}`);
      
      placeholderUser.name = name;
      placeholderUser.password = hashedPassword;
      placeholderUser.profileImage = picture;
      placeholderUser.isRegistered = true; // UPGRADE to full user
      placeholderUser.isVerified = true;   // Google users are pre-verified
      
      user = await placeholderUser.save();
    } else {
      // 3. Create Brand New User
      console.log(`🆕 Creating new Google user: ${cleanEmail}`);
      user = await User.create({
        name,
        email: cleanEmail,
        password: hashedPassword,
        profileImage: picture,
        isRegistered: true,
        isVerified: true
      });
    }

    // 4. Return user and token for both recycled and new users
    res.status(200).json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage || picture || ''
      },
      token: generateToken(user._id)
    });

  } catch (error) {
    console.error("Google Login Error:", error);
    res.status(500).json({ message: "Server error during Google login" });
  }
};

// @desc    Get notification counts for navbar
// @route   GET /api/users/notifications/counts
const getNotificationCounts = async (req, res) => {
  try {
    const userId = req.user.id;

    // Count unread invitations
    const pendingInvites = await ReceivedInvitation.countDocuments({
      recipient: userId,
      isRead: false
    });

    // Find groups where user is admin and sum joinRequests
    const adminGroups = await Group.find({ admins: userId });
    const pendingGroupRequests = adminGroups.reduce((total, group) => {
      return total + (group.joinRequests?.length || 0);
    }, 0);

    res.status(200).json({
      pendingInvites,
      pendingGroupRequests
    });
  } catch (error) {
    console.error("Get Notification Counts Error:", error);
    res.status(500).json({ message: "Error fetching notification counts" });
  }
};

// Paste this near the bottom of the controller file
// 1. REQUEST PHONE SYNC (Generates and sends OTP)
const requestPhoneSync = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');

    // Check if this phone number is already verified by ANOTHER active user
    const existingActiveUser = await User.findOne({ 
      phoneNumber: cleanPhone, 
      isPhoneVerified: true,
      _id: { $ne: userId } // Not the current user
    });

    if (existingActiveUser) {
      return res.status(400).json({ message: "This phone number is already linked to another account." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to the active user
    user.phoneOtp = otp;
    user.phoneOtpExpires = otpExpires;
    // Temporarily store the number they are trying to verify
    user.phoneNumber = cleanPhone; 
    user.isPhoneVerified = false;
    await user.save();

    // ==========================================
    // 🚨 REPLACE THIS WITH REAL SMS API LATER 🚨
    // e.g., await twilioClient.messages.create({ body: `Your OTP is ${otp}`, to: cleanPhone, from: YOUR_TWILIO_NUMBER })
    console.log(`\n📲 SIMULATED SMS TO ${cleanPhone}: Your InvitoInbox sync code is ${otp}\n`);
    // ==========================================

    res.status(200).json({ message: "OTP sent to phone number", requiresOTP: true });

  } catch (error) {
    console.error("Phone Sync Request Error:", error);
    res.status(500).json({ message: "Error requesting phone sync" });
  }
};


// 2. VERIFY PHONE SYNC (Checks OTP and merges data)
const verifyPhoneSync = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    const activeUser = await User.findById(userId);
    if (!activeUser) return res.status(404).json({ message: "User not found" });

    // Check if OTP matches and is not expired
    if (activeUser.phoneOtp !== otp || activeUser.phoneOtpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // OTP IS VALID. Execute the merge protocol.
    const cleanPhone = activeUser.phoneNumber;

    // Look for an orphaned placeholder with this phone number
    const placeholderUser = await User.findOne({ phoneNumber: cleanPhone, isRegistered: false });

    if (placeholderUser) {
      // Transfer the invites
      const ReceivedInvitation = require("../models/ReceivedInvitation");
      await ReceivedInvitation.updateMany(
        { recipient: placeholderUser._id },
        { recipient: activeUser._id }
      );

      // Destroy the empty placeholder
      await placeholderUser.deleteOne();
    }

    // Clean up OTP fields and mark as verified
    activeUser.phoneOtp = undefined;
    activeUser.phoneOtpExpires = undefined;
    activeUser.isPhoneVerified = true;
    await activeUser.save();

    res.status(200).json({ 
      message: "Phone verified and invites successfully synced!",
      phoneNumber: cleanPhone
    });

  } catch (error) {
    console.error("Phone Verification Error:", error);
    res.status(500).json({ message: "Error verifying phone number" });
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
  requestPhoneSync, // <--- MUST BE HERE
  verifyPhoneSync   // <--- MUST BE HERE
};