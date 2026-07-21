const User = require("../models/User");
const Invitation = require("../models/Invitation");
const ReceivedInvitation = require("../models/ReceivedInvitation");
const Group = require("../models/Group");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const sendEmail = require("../utils/sendEmail");
const sendPushNotification = require('../utils/pushNotification');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
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

    // Check if a fully registered user already exists
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

    // 1. Try to find a placeholder by the email provided
    let placeholderUser = await User.findOne({ 
      email: cleanEmail, 
      isRegistered: { $ne: true } 
    });

    // 2. If no email match, search by phone number using fuzzy matching
    if (!placeholderUser && cleanPhone) {
      // Extract only the raw digits, and grab up to the last 10
      const coreDigits = cleanPhone.replace(/\D/g, '').slice(-10);
      
      // STRICT CHECK: Only do fuzzy matching if we have exactly 10 core digits
      if (coreDigits.length === 10) { 
        placeholderUser = await User.findOne({ 
          phoneNumber: { $regex: coreDigits + '$' }, 
          isRegistered: { $ne: true } 
        });
      } else {
        // Fallback: If they typed something weird, enforce an exact, strict match
        placeholderUser = await User.findOne({ 
          phoneNumber: cleanPhone, 
          isRegistered: { $ne: true } 
        });
      }
    }

    // 3. Claim the placeholder if we found one
    if (placeholderUser) {
      placeholderUser.name = name;
      placeholderUser.email = cleanEmail;
      placeholderUser.password = hashedPassword;
      if (cleanPhone) placeholderUser.phoneNumber = cleanPhone;
      placeholderUser.otp = otp;
      placeholderUser.otpExpires = otpExpires;
      placeholderUser.isVerified = false; 
      // CRITICAL: Do not set isRegistered to true here. Keep it false until OTP is verified.
      
      user = await placeholderUser.save();
      isRecycled = true;
    }

    // 4. Create a brand new user if no placeholder existed
    if (!isRecycled) {
      user = await User.create({
        name,
        email: cleanEmail,
        password: hashedPassword,
        phoneNumber: cleanPhone,
        otp,
        otpExpires,
        isVerified: false,
        isRegistered: false // CRITICAL: Start as false
      });
    }

    // 5. Send the email
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
          secondaryPhone: user.secondaryPhone || null,
          profileImage: user.profileImage || '',
          isPhoneVerified: user.isPhoneVerified || false,
          isSecondaryPhoneVerified: user.isSecondaryPhoneVerified || false
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

    // CRITICAL FIX: Now we officially mark them as registered
    await User.updateOne(
      { _id: user._id },
      { 
        $set: { isVerified: true, isRegistered: true },
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
        { upsert: true, returnDocument: 'after' }
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
        { email: { $regex: query, $options: 'i' } },
        { phoneNumber: { $regex: query, $options: 'i' } },
        { secondaryPhone: { $regex: query, $options: 'i' } }
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
// @desc    Update user profile
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phoneNumber, secondaryPhone, profileImage } = req.body;
    const updateData = {};
    
    if (name) updateData.name = name;
    if (profileImage !== undefined) updateData.profileImage = profileImage;

    // SECURITY LOCKDOWN: Users cannot bypass OTP by injecting phone numbers here.
    // They can ONLY use this route to delete a number (set to null/empty).
    if (phoneNumber === null || phoneNumber === "") {
      updateData.phoneNumber = null;
      updateData.isPhoneVerified = false;
    }
    if (secondaryPhone === null || secondaryPhone === "") {
      updateData.secondaryPhone = null;
      updateData.isSecondaryPhoneVerified = false;
    }

    const user = await User.findByIdAndUpdate(userId, updateData, { returnDocument: 'after' }).select('-password');
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

    if (!idToken) {
      return res.status(400).json({ message: "Google ID token is required" });
    }

    // 1. Verify the token with Google
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: [
        process.env.GOOGLE_CLIENT_ID, 
        process.env.VITE_GOOGLE_CLIENT_ID // Or whatever you named the web ID in your backend .env
      ],
    });

    const payload = ticket.getPayload();
    const email = payload.email.toLowerCase().trim();
    const name = payload.name;

    // 2. Check if the user already exists in your database
    let user = await User.findOne({ email });

    // 3. If they don't exist, register them silently
    if (!user) {
      user = await User.create({
        name: name,
        email: email,
        // Give them a random impossible password since they use Google
        password: Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10),
        isVerified: true // Google emails are inherently verified
      });
    }

    // 4. Generate your standard JWT for the app session
    const token = generateToken(user._id); // Ensure you are calling your standard token generator here

    // 5. Send success response
    // 5. Send success response
    res.status(200).json({
      message: "Google login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        secondaryPhone: user.secondaryPhone || null,
        profileImage: user.profileImage || '',
        isPhoneVerified: user.isPhoneVerified || false,
        isSecondaryPhoneVerified: user.isSecondaryPhoneVerified || false,
        role: user.role
      }
    });

  } catch (error) {
    console.error("Google Auth Backend Error:", error);
    res.status(500).json({ message: "Failed to verify Google token", error: error.message });
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

// IDENTITY SYNC LOGIC
const verifyPhoneSync = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    const userId = req.user.id;

    if (otp !== '123456') { // HARDCODED FOR TESTING
      return res.status(400).json({ message: "Invalid OTP code." });
    }

    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');

    // 1. Merge Placeholder User using fuzzy matching
    const coreDigits = cleanPhone.replace(/\D/g, '').slice(-10);
    let placeholderUser;

    if (coreDigits.length === 10) {
      placeholderUser = await User.findOne({ 
        phoneNumber: { $regex: coreDigits + '$' }, 
        isRegistered: { $ne: true } 
      });
    } else {
      placeholderUser = await User.findOne({ 
        phoneNumber: cleanPhone, 
        isRegistered: { $ne: true } 
      });
    }

    if (placeholderUser) {
      // A. Transfer individual received invites
      await ReceivedInvitation.updateMany(
        { recipient: placeholderUser._id }, 
        { recipient: userId }
      );

      // B. Transfer the IDs inside the host's actual event arrays
      await Invitation.updateMany(
        { invitedUsers: placeholderUser._id },
        { 
          $addToSet: { invitedUsers: userId },
          $pull: { invitedUsers: placeholderUser._id }
        }
      );

      // C. Transfer group memberships if they were added directly
      await Group.updateMany(
        { members: placeholderUser._id },
        { 
          $addToSet: { members: userId },
          $pull: { members: placeholderUser._id }
        }
      );

      // Now it is safe to delete the ghost account
      await placeholderUser.deleteOne();
    }

    // 2. Merge Invitations sent to this phone number (No placeholder)
    const inviteUpdate = await ReceivedInvitation.updateMany(
      { phoneNumber: cleanPhone, recipient: { $exists: false } },
      { recipient: userId }
    );

    // 3. Merge Groups (Pending members)
    const groupUpdate = await Group.updateMany(
      { "pendingMembers.phoneNumber": cleanPhone },
      { 
        $addToSet: { members: userId },
        $pull: { pendingMembers: { phoneNumber: cleanPhone } }
      }
    );

    // 4. Update the active user's profile
    await User.findByIdAndUpdate(userId, { phoneNumber: cleanPhone, isPhoneVerified: true });

    res.status(200).json({ 
      message: "Sync complete!", 
      invitesLinked: inviteUpdate.modifiedCount,
      groupsJoined: groupUpdate.modifiedCount
    });
  } catch (error) {
    console.error("Phone Sync Error:", error);
    res.status(500).json({ message: "Sync failed" });
  }
};

const updatePushToken = async (req, res) => {
  try {
    // Use req.user.id to match your auth middleware standards
    const userId = req.user.id || req.user._id; 
    
    // Extract exactly what the frontend is sending
    const { expoPushToken } = req.body;

    if (!expoPushToken) {
      return res.status(400).json({ message: "Push token is required" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { expoPushToken: expoPushToken }, 
      { returnDocument: 'after' }
    );

    res.status(200).json({ message: "Push token saved successfully", user: updatedUser });
  } catch (error) {
    console.error("Error saving push token:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Add this new controller function
const testPushNotification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.expoPushToken) {
      return res.status(400).json({ message: "No push token found for this user in the database." });
    }

    // Fire the notification
    const success = await sendPushNotification(
      user.expoPushToken,
      "It Works! 🚀",
      "Your database successfully talked to your phone."
    );

    if (success) {
      res.status(200).json({ message: "Test notification sent successfully." });
    } else {
      res.status(500).json({ message: "Failed to send to Expo servers." });
    }
  } catch (error) {
    console.error("Test push error:", error);
    res.status(500).json({ message: "Server error during test push." });
  }
};

// @desc    Save Expo Push Token
// @route   PUT /api/users/push-token
// @access  Private
const savePushToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: "No token provided" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.expoPushToken = token;
    await user.save();

    res.status(200).json({ message: "Push token saved successfully" });
  } catch (error) {
    console.error("Save Push Token Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
// @desc    Request OTP for secondary phone sync
const requestSecondaryPhoneSync = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ message: "Phone number is required" });
    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');

    // Must not already be claimed as a verified primary or secondary by someone else
    const existingUser = await User.findOne({
      _id: { $ne: userId },
      $or: [
        { phoneNumber: cleanPhone, isPhoneVerified: true },
        { secondaryPhone: cleanPhone, isSecondaryPhoneVerified: true }
      ]
    });
    if (existingUser) return res.status(400).json({ message: "This number is already linked to another account." });

    // Must not be same as user's own primary phone
    const currentUser = await User.findById(userId);
    if (currentUser.phoneNumber === cleanPhone) {
      return res.status(400).json({ message: "This is already your primary phone number." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    currentUser.secondaryPhoneOtp = otp;
    currentUser.secondaryPhoneOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    currentUser.secondaryPhone = cleanPhone;
    await currentUser.save();

    console.log(`\n📲 SIMULATED SMS TO ${cleanPhone}: Your secondary phone OTP is ${otp}\n`);
    res.status(200).json({ message: "OTP sent to secondary phone number", requiresOTP: true });
  } catch (error) {
    console.error("Secondary Phone Sync Request Error:", error);
    res.status(500).json({ message: "Error requesting secondary phone sync" });
  }
};

// @desc    Verify OTP and complete secondary phone sync (with invite merge)
const verifySecondaryPhoneSync = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    const userId = req.user.id;

    const currentUser = await User.findById(userId);
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    // Validate OTP
    if (
      !currentUser.secondaryPhoneOtp ||
      currentUser.secondaryPhoneOtp !== otp ||
      currentUser.secondaryPhoneOtpExpires < new Date()
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
    const coreDigits = cleanPhone.replace(/\D/g, '').slice(-10);

    // Merge placeholder user if one exists for this number
    let placeholderUser;
    if (coreDigits.length === 10) {
      placeholderUser = await User.findOne({
        phoneNumber: { $regex: coreDigits + '$' },
        isRegistered: { $ne: true }
      });
    } else {
      placeholderUser = await User.findOne({
        phoneNumber: cleanPhone,
        isRegistered: { $ne: true }
      });
    }

    if (placeholderUser) {
      await ReceivedInvitation.updateMany({ recipient: placeholderUser._id }, { recipient: userId });
      await Invitation.updateMany(
        { invitedUsers: placeholderUser._id },
        { $addToSet: { invitedUsers: userId }, $pull: { invitedUsers: placeholderUser._id } }
      );
      await Group.updateMany(
        { members: placeholderUser._id },
        { $addToSet: { members: userId }, $pull: { members: placeholderUser._id } }
      );
      await placeholderUser.deleteOne();
    }

    // Mark secondary phone as verified and clear OTP fields
    await User.findByIdAndUpdate(userId, {
      secondaryPhone: cleanPhone,
      isSecondaryPhoneVerified: true,
      $unset: { secondaryPhoneOtp: 1, secondaryPhoneOtpExpires: 1 }
    });

    const updatedUser = await User.findById(userId).select('-password');

    res.status(200).json({
      message: "Secondary phone synced successfully!",
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        secondaryPhone: updatedUser.secondaryPhone,
        isPhoneVerified: updatedUser.isPhoneVerified,
        isSecondaryPhoneVerified: updatedUser.isSecondaryPhoneVerified,
        profileImage: updatedUser.profileImage || ''
      }
    });
  } catch (error) {
    console.error("Secondary Phone Sync Verify Error:", error);
    res.status(500).json({ message: "Secondary phone sync failed" });
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
  verifyPhoneSync,
  requestSecondaryPhoneSync,
  verifySecondaryPhoneSync,
  updatePushToken,
  testPushNotification,
  savePushToken
};