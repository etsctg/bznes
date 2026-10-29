/* =====================================================================
   ঐচ্ছিক: প্রতিদিন স্বয়ংক্রিয়, নিশ্চিত ব্যাকআপ (সার্ভার-সাইড Cloud Function)
   ---------------------------------------------------------------------
   অ্যাপের ভেতরের "লগআউটের সময় ব্যাকআপ মনে করিয়ে দেওয়া" ফিচারটা নির্ভর করে
   ইউজার সত্যিই "লগআউট" বাটনে চাপার ওপর — ব্রাউজার হঠাৎ বন্ধ করলে, ট্যাব
   ক্র্যাশ করলে, বা ইউজার এড়িয়ে গেলে এটা কার্যকর হয় না। "১০০% নিশ্চিত
   প্রতিদিন ব্যাকআপ" বাস্তবে পেতে হলে ইউজারের আচরণের ওপর নির্ভর না করে
   সার্ভার নিজে থেকে প্রতিদিন একবার ব্যাকআপ নেবে — এই ফাইলটা ঠিক সেই কাজ করে।

   এটা Firebase-এর পেইড (Blaze — pay-as-you-go) প্ল্যান ছাড়া চলে না, কারণ
   Scheduled Functions ফ্রি (Spark) প্ল্যানে পাওয়া যায় না। ছোট দোকানের
   ডেটার আকারে এটার মাসিক খরচ সাধারণত সামান্য (কয়েক টাকার মধ্যে) হওয়ার
   কথা, কিন্তু Google-এর বর্তমান মূল্য নিজে যাচাই করে নেবেন।

   বসানোর ধাপ:
   ১. আপনার প্রজেক্টকে Blaze প্ল্যানে আপগ্রেড করুন (Firebase Console → Usage and billing)।
   ২. টার্মিনালে:
        npm install -g firebase-tools
        firebase login
        firebase init functions   (প্রজেক্ট ফোল্ডারে; ভাষা হিসেবে JavaScript বেছে নিন)
   ৩. এই ফাইলের ভেতরের কোডটুকু functions/index.js-এ বসান (অথবা require করে যোগ করুন)।
   ৪. functions ফোল্ডারে: npm install firebase-admin firebase-functions
   ৫. firebase deploy --only functions
   ৬. Firebase Console → Storage-এ একটা bucket থাকা দরকার (প্রথমবার Storage চালু
      করতে বললে করে নিন)। ব্যাকআপ ফাইল সেখানে jমা হবে:
      gs://<your-project>.appspot.com/daily-backups/YYYY-MM-DD.json
   ৭. (ঐচ্ছিক) প্রতিদিনের ব্যাকআপ সফল হলো কিনা জানতে একটা ইমেইল/Slack নোটিফিকেশন
      যোগ করতে পারেন — নিচের কোডে যেখানে "// TODO: notify" লেখা আছে সেখানে।

   এই ফাংশন প্রতিদিন রাত ২টায় (এশিয়া/ঢাকা সময়) চলবে এবং sales, purchases,
   expenses, customers, suppliers, products, users, returns, due_payments
   কালেকশনগুলোর পূর্ণ কপি একটা JSON ফাইলে Storage-এ রাখবে। Firestore-এর নিজস্ব
   অটোমেটেড এক্সপোর্টও (gcloud firestore export) আরেকটা বিকল্প, তবে সেটা
   পড়তে/বুঝতে বেশি টেকনিক্যাল — এই স্ক্রিপ্টের আউটপুট সরাসরি এই অ্যাপের
   "ব্যাকআপ রিস্টোর" ফিচারে ব্যবহারযোগ্য JSON ফরম্যাটে রাখা আছে।
   ===================================================================== */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
admin.initializeApp();

const COLLECTIONS = [
  'erp_products', 'erp_customers', 'erp_suppliers',
  'erp_sales', 'erp_purchases', 'erp_expenses',
  'erp_users', 'erp_returns', 'erp_due_payments'
];

exports.dailyBackup = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'Asia/Dhaka', region: 'asia-south1' },
  async () => {
    const db = admin.firestore();
    const backup = { exportedAt: new Date().toISOString(), source: 'scheduled-cloud-function' };

    for (const name of COLLECTIONS) {
      const snap = await db.collection(name).get();
      // ব্যাকআপ-রিস্টোর ফিচারটা 'sales'/'purchases'/... (বহুবচন, erp_ ছাড়া) নাম আশা করে
      const key = name.replace('erp_', '');
      backup[key] = snap.docs.map(d => d.data());
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const bucket = admin.storage().bucket();
    const file = bucket.file(`daily-backups/${dateStr}.json`);
    await file.save(JSON.stringify(backup, null, 2), {
      contentType: 'application/json',
      metadata: { cacheControl: 'no-cache' }
    });

    console.log(`✅ দৈনিক ব্যাকআপ সম্পন্ন: daily-backups/${dateStr}.json (${COLLECTIONS.length}টা কালেকশন)`);
    // TODO: notify — চাইলে এখানে ইমেইল/Slack/Telegram-এ "ব্যাকআপ সফল হয়েছে" বার্তা পাঠানো যায়।

    // ৯০ দিনের বেশি পুরনো দৈনিক ব্যাকআপ ফাইল মুছে স্টোরেজ খরচ বাড়তে না দেওয়া (ঐচ্ছিক)
    const [files] = await bucket.getFiles({ prefix: 'daily-backups/' });
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    for (const f of files) {
      const [meta] = await f.getMetadata();
      if (new Date(meta.timeCreated).getTime() < cutoff) await f.delete().catch(() => {});
    }
  }
);
