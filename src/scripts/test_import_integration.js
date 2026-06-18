require('dotenv').config();
const mongoose = require('mongoose');
// Register models first
require('../models/classModel');
require('../models/chapterModel');
const ImportJob = require('../models/importJobModel');
const ImportItem = require('../models/importItemModel');
const Question = require('../models/questionModel');
const User = require('../models/userModel');
const { ImportParserService } = require('../services/importParserService');
const { confirmJobItems } = require('../controllers/importController');

const sampleMarkdown = `
### Question 1
What is the derivative of x^2?
A) x
B) 2x
C) x^2
D) 2
Answer: B
Class: 12
Chapter: Continuity and Differentiability
Language: English
Explanation: Using power rule, d/dx(x^n) = n*x^(n-1).

### Question 2
What is the integration of sin(x)?
A) cos(x)
B) -cos(x)
C) tan(x)
D) -sin(x)
Answer: B
Class: 12
Chapter: Integrals
Language: English
Explanation: Integral of sin(x) is -cos(x) + C.
`;

async function runTest() {
  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME
  });
  console.log('Connected!');

  // Seed Class 12 and initialize cache
  const Class = mongoose.model('Class');
  let class12 = await Class.findOne({ classId: 12 });
  if (!class12) {
    class12 = new Class({ classId: 12, className: 'Class 12' });
    await class12.save();
    console.log('Created Class 12');
  }
  const { initCache } = require('../utils/classCache');
  await initCache();

  // Setup a dummy user to associate with the job
  let user = await User.findOne({ role: 'teacher' });
  if (!user) {
    user = new User({
      name: 'Test Teacher',
      email: 'test_teacher_import@example.com',
      password: 'password_placeholder_hash_longer_than_forty_characters',
      role: 'teacher'
    });
    await user.save();
    console.log('Created test teacher user');
  }

  // Clear previous test records
  await ImportJob.deleteMany({ sourceFileName: 'TEST_INTEGRATION_SOURCE' });
  await Question.deleteMany({ questionText: /What is the derivative of x\^2/ });
  await Question.deleteMany({ question: /What is the derivative of x\^2/ });

  // 1. Create a markdown import job
  console.log('\n--- 1. Creating Import Job ---');
  const job = new ImportJob({
    userId: user._id,
    status: 'queued',
    importType: 'markdown',
    sourceFileName: 'TEST_INTEGRATION_SOURCE',
    rawSourceData: sampleMarkdown
  });
  await job.save();
  console.log(`Created Job ID: ${job._id}, Status: ${job.status}`);

  // 2. Trigger parsing synchronous for test
  console.log('\n--- 2. Parsing Markdown Source ---');
  await ImportParserService.processJob(job._id);

  // Reload job and check status
  const parsedJob = await ImportJob.findById(job._id);
  console.log(`Parsed Job Status: ${parsedJob.status}, Total Items Extracted: ${parsedJob.totalItems}`);
  if (parsedJob.status !== 'preview_ready') {
    throw new Error(`Job status is not preview_ready: ${parsedJob.status}. Error: ${parsedJob.errorMessage}`);
  }

  // Get items
  const items = await ImportItem.find({ importJobId: job._id });
  console.log(`Found ${items.length} items for job.`);
  items.forEach((item, index) => {
    console.log(`Item ${index + 1}: ${item.question}`);
    console.log(`  Options: ${item.options.join(', ')}`);
    console.log(`  Correct Answer: ${item.correctAnswer}`);
    console.log(`  Class: ${item.className}, Chapter: ${item.chapterName}`);
    console.log(`  Duplicate detected: ${item.duplicateFound}`);
  });

  if (items.length !== 2) {
    throw new Error(`Expected 2 items, got ${items.length}`);
  }

  // 3. Confirm items (save to production Questions)
  console.log('\n--- 3. Batch Confirming Items ---');
  const confirmItemIds = [items[0]._id.toString()];
  const rejectItemIds = [items[1]._id.toString()];

  let mockResData = null;
  const mockReq = {
    params: { id: job._id.toString() },
    body: { confirmItemIds, rejectItemIds },
    user: { id: user._id.toString() }
  };
  const mockRes = {
    status(code) {
      return this;
    },
    json(obj) {
      mockResData = obj;
      return this;
    }
  };

  await confirmJobItems(mockReq, mockRes);
  console.log('Confirm response:', JSON.stringify(mockResData, null, 2));

  // Check database for saved questions
  const savedQuestion = await Question.findOne({ classId: { $exists: true } }).sort({ createdAt: -1 });
  console.log('\n--- 4. Checking Production Question table ---');
  if (!savedQuestion) {
    throw new Error('No production question saved!');
  }
  console.log('Saved production question text:', savedQuestion.question);
  console.log('Saved production options:', savedQuestion.options.join(', '));
  console.log('Saved production correct answer:', savedQuestion.correctAnswer);

  // Check statuses of items
  const item1 = await ImportItem.findById(items[0]._id);
  const item2 = await ImportItem.findById(items[1]._id);
  console.log(`Item 1 status (confirmed): ${item1.status}`);
  console.log(`Item 2 status (rejected): ${item2.status}`);

  if (item1.status !== 'saved' || item2.status !== 'rejected') {
    throw new Error('Item statuses did not update correctly!');
  }

  // Clean up
  await ImportJob.deleteMany({ sourceFileName: 'TEST_INTEGRATION_SOURCE' });
  await ImportItem.deleteMany({ importJobId: job._id });
  await Question.deleteMany({ _id: savedQuestion._id });
  if (user.email === 'test_teacher_import@example.com') {
    await User.deleteOne({ _id: user._id });
  }


  console.log('\n✓ All backend import integration tests passed successfully!');
  await mongoose.disconnect();
}

runTest().catch(err => {
  console.error('Test failed:', err);
  mongoose.disconnect().then(() => process.exit(1));
});
