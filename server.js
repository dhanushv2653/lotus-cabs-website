require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const nodemailer = require("nodemailer");
const app = express();
const PORT = 3000;

// ===== middleware =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== static =====
app.use(express.static(__dirname));

// ===== MongoDB connect =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("Mongo error:", err));

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
// ===== Schema =====
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 requests per IP
  message: {
    success: false,
    message: "Too many booking attempts. Please try again later."
  }
});
const bookingSchema = new mongoose.Schema({
  rideType: String,
  pickupCity: String,
  dropCity: String,
  pickupAddress: String,
  date: String,
  time: String,
  vehicle: String,
  name: String,
  mobile: String,
  instructions: String,
  createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model("Booking", bookingSchema);

// ===== API route =====
app.post("/api/book",bookingLimiter, async (req, res) => {
  try {
    const {
      rideType,
      pickupCity,
      dropCity,
      pickupAddress,
      date,
      time,
      vehicle,
      name,
      mobile,
      instructions
    } = req.body;
const { recaptchaToken } = req.body;

if (!recaptchaToken) {
  return res.status(400).json({
    success: false,
    message: "Captcha required"
  });
}

const verifyURL = "https://www.google.com/recaptcha/api/siteverify";

const response = await axios.post(verifyURL, null, {
  params: {
    secret: process.env.RECAPTCHA_SECRET,
    response: recaptchaToken
  }
});

if (!response.data.success) {
  return res.status(400).json({
    success: false,
    message: "Captcha verification failed"
  });
}
    // ===== Required field validation =====
    if (!pickupCity || !dropCity || !mobile || !name) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields"
      });
    }

    // ===== Mobile number validation (India format) =====
    const phoneRegex = /^[6-9]\d{9}$/;

    if (!phoneRegex.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mobile number"
      });
    }

    // ===== Optional: prevent same pickup & drop =====
   if (rideType === "outstation" && pickupCity === dropCity) {
  return res.status(400).json({
    success: false,
    message: "Pickup and Drop city cannot be the same for outstation rides"
  });
}

    // ===== Save to DB =====
    const booking = new Booking({
      rideType,
      pickupCity,
      dropCity,
      pickupAddress,
      date,
      time,
      vehicle,
      name,
      mobile,
      instructions
    });

    await booking.save();
    await transporter.sendMail({
  from: `"Lotus Cabs Booking" <${process.env.EMAIL_USER}>`,
  to: process.env.EMAIL_USER,
  subject: "New Ride Booking Received",
  html: `
    <h2>New Booking</h2>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Mobile:</strong> ${mobile}</p>
    <p><strong>Ride Type:</strong> ${rideType}</p>
    <p><strong>Pickup:</strong> ${pickupCity}</p>
    <p><strong>Drop:</strong> ${dropCity}</p>
    <p><strong>Date:</strong> ${date}</p>
    <p><strong>Time:</strong> ${time}</p>
    <p><strong>Vehicle:</strong> ${vehicle}</p>
    <p><strong>Instructions:</strong> ${instructions || "None"}</p>
  `
});
    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});


// ===== start =====
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});