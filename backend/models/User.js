const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [6, "Password must be at least 6 characters"]
  },
  phoneNumber: {
    type: String,
    default: null,
    sparse: true
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  phoneOtp: {
    type: String
  },
  phoneOtpExpires: {
    type: Date
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  otp: {
    type: String
  },
  otpExpires: {
    type: Date
  },
  resetPasswordOtp: {
    type: String
  },
  resetPasswordOtpExpire: {
    type: Date
  },
  profileImage: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);