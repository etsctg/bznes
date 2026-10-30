/* =====================================================================
   config.js — প্রতি ক্লায়েন্টের জন্য শুধু এই ফাইলটাই বদলাতে হয়
   ---------------------------------------------------------------------
   ১) firebaseConfig  → ক্লায়েন্টের নিজস্ব Firebase প্রজেক্টের তথ্য
   ২) LICENSE_NO      → ক্লায়েন্টের লাইসেন্স নম্বর (vendor-tools/license-manager.html থেকে নিন)
      (আসল মেয়াদ/সীমা Firestore-এর erp_license/current-এ থাকে — এটা শুধু দেখানোর জন্য ও মিলিয়ে দেখার জন্য)
   ৩) VENDOR          → বিক্রেতার (আপনার) যোগাযোগের তথ্য — লাইসেন্স-বন্ধ/মেয়াদ-শেষ স্ক্রিনে দেখায়
   ===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyDrFR9Ycw4xpeaueNn92wWrT3c2diD1cLM",
  authDomain: "bzneserp.firebaseapp.com",
  projectId: "bzneserp",
  storageBucket: "bzneserp.firebasestorage.app",
  messagingSenderId: "412722396147",
  appId: "1:412722396147:web:ddbf530520c5b662f67086"
};

const LICENSE_NO = '';          // যেমন: 'BERP-2610-0001-K7' (খালি থাকলে শুধু Firestore-এর নম্বর দেখানো হবে)
const VENDOR = { name:'ব্যবসা ম্যানেজার — বিক্রেতা', phone:'01869866899', email:'info.wasbd@gmail.com' };
